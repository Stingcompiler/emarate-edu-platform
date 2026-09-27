"""Commit, publish and correct results; the student's view with GPA."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts import rbac
from audit.services import RequestMeta, record
from core.errors import Conflict
from notifications.models import Category
from notifications.services import notify

from .models import (
    AcademicResult,
    GradingScale,
    ResultCorrection,
    ResultDisplaySettings,
    ResultImportBatch,
    ResultImportRow,
    TermResultRelease,
)

B = ResultImportBatch.Status


def _dept(batch: ResultImportBatch) -> int | None:
    return batch.department_id


def require_batch_scope(user, batch: ResultImportBatch) -> None:
    scope = rbac.scope_for(user, "results.manage")
    allowed = scope.everything if batch.department_id is None else scope.allows(batch.department_id)
    if not allowed:
        raise PermissionDenied("Outside your results scope.")


def commit(meta: RequestMeta, batch: ResultImportBatch) -> ResultImportBatch:
    require_batch_scope(meta.actor, batch)
    if batch.status not in (B.VALIDATED, B.HAS_ERRORS):
        raise Conflict("This batch was already committed or rejected.", code="batch_closed")
    rows = batch.rows.filter(action=ResultImportRow.Action.CREATE).select_related("offering")
    results = [
        AcademicResult(
            student_record_id=row.student_record_id,
            offering_id=row.offering_id,
            term_id=batch.term_id,
            score=Decimal(row.normalized["score"]) if row.normalized["score"] is not None else None,
            letter=row.normalized["letter"],
            grade_points=Decimal(row.normalized["grade_points"]),
            status=row.normalized["status"],
            import_batch=batch,
        )
        for row in rows
    ]
    try:
        with transaction.atomic():
            AcademicResult.objects.bulk_create(results, batch_size=1000)
            batch.status = B.COMMITTED
            batch.committed_at = timezone.now()
            batch.summary = {**batch.summary, "committed": len(results)}
            batch.save(update_fields=["status", "committed_at", "summary", "updated_at"])
            record(meta, "results.commit", batch, new=batch.summary, department_id=_dept(batch))
    except IntegrityError:
        raise Conflict(
            "Some students got a result from another batch meanwhile. Upload the file again.",
            code="conflict",
        ) from None
    return batch


def set_published(
    meta: RequestMeta, batch: ResultImportBatch, published: bool
) -> ResultImportBatch:
    require_batch_scope(meta.actor, batch)
    allowed = (B.COMMITTED, B.UNPUBLISHED) if published else (B.PUBLISHED,)
    if batch.status not in allowed:
        raise Conflict(
            "Commit the batch first." if published else "Not published.", code="bad_state"
        )
    now = timezone.now()
    with transaction.atomic():
        results = AcademicResult.objects.filter(import_batch=batch)
        if published:
            results.update(is_published=True, published_at=now, published_by=meta.actor)
        else:
            results.update(is_published=False)
        batch.status = B.PUBLISHED if published else B.UNPUBLISHED
        batch.published_at = now if published else batch.published_at
        batch.save(update_fields=["status", "published_at", "updated_at"])
        record(
            meta,
            "results.publish" if published else "results.unpublish",
            batch,
            department_id=_dept(batch),
        )
        if published:
            from django.contrib.auth import get_user_model

            users = (
                get_user_model()
                .objects.filter(student_record__results__import_batch=batch, is_active=True)
                .distinct()
            )
            notify(
                users,
                category=Category.RESULTS,
                title=f"نُشرت نتائج {batch.term.name_ar}",
                body="اطّلع على نتائجك في البوابة.",
                action_url="/results",
                channels=["inapp", "push", "email"],
            )
    return batch


def reject(meta: RequestMeta, batch: ResultImportBatch) -> None:
    """Only an uncommitted batch can be removed (docs/03 §3.4)."""
    require_batch_scope(meta.actor, batch)
    if batch.status not in (B.VALIDATED, B.HAS_ERRORS):
        raise Conflict(
            "A committed batch cannot be deleted; unpublish it instead.", code="committed"
        )
    with transaction.atomic():
        record(meta, "results.import_delete", batch, old=batch.summary, department_id=_dept(batch))
        batch.delete()


# ─── Corrections ──────────────────────────────────────────────────────────


def _values(result: AcademicResult) -> dict:
    return {
        "score": str(result.score) if result.score is not None else None,
        "letter": result.letter,
        "grade_points": str(result.grade_points),
        "status": result.status,
    }


def request_correction(
    meta: RequestMeta, result: AcademicResult, *, score=None, status=None, reason: str
) -> ResultCorrection:
    if not rbac.can(meta.actor, "results.correct"):
        raise PermissionDenied()
    if not reason.strip():
        raise ValidationError({"reason": ["A reason is required."]})
    new = _values(result)
    if score is not None:
        ranges = GradingScale.for_program(result.student_record.program_id)
        letter, points = GradingScale.grade(ranges, Decimal(score))
        new.update(score=str(Decimal(score)), letter=letter, grade_points=str(points))
        new["status"] = "fail" if letter.upper() == "F" else "pass"
    if status is not None:
        new["status"] = status
        if status in ("absent", "withdrawn", "incomplete") and score is None:
            new.update(score=None, letter="", grade_points="0.00")
    if new == _values(result):
        raise ValidationError({"detail": ["Nothing would change."]})
    try:
        with transaction.atomic():
            correction = ResultCorrection.objects.create(
                result=result, requested_by=meta.actor, old=_values(result), new=new, reason=reason
            )
            record(
                meta,
                "results.correction_request",
                result,
                old=correction.old,
                new=correction.new,
                department_id=result.offering.course.department_id,
            )
    except IntegrityError:
        raise Conflict("This result already has a pending correction.", code="pending") from None
    return correction


def decide_correction(
    meta: RequestMeta, correction: ResultCorrection, *, approve: bool, note: str = ""
) -> ResultCorrection:
    if not rbac.can(meta.actor, "results.approve"):
        raise PermissionDenied()
    if correction.status != ResultCorrection.Status.PENDING:
        raise Conflict("Already decided.", code="already_decided")
    result = correction.result
    with transaction.atomic():
        correction.status = (
            ResultCorrection.Status.APPROVED if approve else ResultCorrection.Status.REJECTED
        )
        correction.decided_by = meta.actor
        correction.decided_at = timezone.now()
        correction.decision_note = note
        correction.save()
        if approve:
            new = correction.new
            result.score = Decimal(new["score"]) if new["score"] is not None else None
            result.letter = new["letter"]
            result.grade_points = Decimal(new["grade_points"])
            result.status = new["status"]
            result.version += 1
            result.save()
            if result.is_published and result.student_record.user_id:
                notify(
                    [result.student_record.user],
                    category=Category.RESULTS,
                    title=f"عُدّلت نتيجة {result.offering.course.code}",
                    body=f"{result.offering.course.name_ar}",
                    action_url="/results",
                    channels=["inapp", "push", "email"],
                )
        record(
            meta,
            "results.correction_approve" if approve else "results.correction_reject",
            result,
            old=correction.old,
            new=correction.new if approve else None,
            department_id=result.offering.course.department_id,
        )
    return correction


# ─── What a student sees ──────────────────────────────────────────────────

GPA_STATUSES = {AcademicResult.Status.PASS, AcademicResult.Status.FAIL}


def _gpa(rows) -> Decimal | None:
    credits = sum(r.offering.course.credit_hours for r in rows if r.status in GPA_STATUSES)
    if not credits:
        return None
    points = sum(
        r.grade_points * r.offering.course.credit_hours for r in rows if r.status in GPA_STATUSES
    )
    return (points / credits).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def student_view(record_) -> dict:
    display = ResultDisplaySettings.load()
    hidden = TermResultRelease.objects.filter(is_visible=False).filter(
        program__isnull=True
    ) | TermResultRelease.objects.filter(is_visible=False, program=record_.program_id)
    hidden_terms = set(hidden.values_list("term_id", flat=True))
    results = (
        AcademicResult.objects.filter(student_record=record_, is_published=True)
        .exclude(term_id__in=hidden_terms)
        .select_related("offering__course", "term")
        .order_by("-term__starts_on", "offering__course__code")
    )
    terms: dict[int, dict] = {}
    for result in results:
        entry = terms.setdefault(result.term_id, {"term": result.term, "rows": []})
        entry["rows"].append(result)
    ordered = list(terms.values())
    if not display.history_open:
        ordered = ordered[:1]
    all_rows = [r for t in ordered for r in t["rows"]]
    return {
        "display": display,
        "terms": [{"term": t["term"], "rows": t["rows"], "gpa": _gpa(t["rows"])} for t in ordered],
        "cumulative_gpa": _gpa(all_rows),
    }
