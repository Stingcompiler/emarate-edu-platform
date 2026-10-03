"""Regulations, cases, misconduct reports and student status — every change audited."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from academic.models import Enrollment, OfferingInstructor
from accounts import rbac
from accounts.rbac import Role
from audit.services import RequestMeta, record, snapshot
from core.errors import Conflict
from files.models import Purpose, StoredFile
from notifications.models import Category
from notifications.services import notify, notify_audience
from students.models import StudentRecord

from .models import (
    MisconductReport,
    Regulation,
    RegulationAcknowledgement,
    StudentCase,
    StudentCaseEvent,
)


def _require(user, capability: str, department_id=None) -> None:
    if not rbac.can(user, capability, department_id):
        raise PermissionDenied()


def _check_file(stored: StoredFile | None, purpose: str) -> None:
    if stored is not None and stored.purpose != purpose:
        raise ValidationError({"file": [gettext("Upload the file for this purpose first.")]})


# ─── Regulations ──────────────────────────────────────────────────────────


def save_regulation(meta: RequestMeta, regulation: Regulation | None, **data) -> Regulation:
    _require(meta.actor, "regulations.manage")
    _check_file(data.get("file"), Purpose.REGULATION)
    with transaction.atomic():
        if regulation is None:
            regulation = Regulation.objects.create(created_by=meta.actor, **data)
            record(meta, "regulation.create", regulation, new=snapshot(regulation))
            return regulation
        if regulation.status != Regulation.Status.DRAFT:
            raise Conflict(
                gettext("Published regulations change through a new version."), code="published"
            )
        old = snapshot(regulation)
        for field, value in data.items():
            setattr(regulation, field, value)
        regulation.save()
        record(meta, "regulation.update", regulation, old=old, new=snapshot(regulation))
    return regulation


def new_version(meta: RequestMeta, regulation: Regulation) -> Regulation:
    _require(meta.actor, "regulations.manage")
    if regulation.status != Regulation.Status.PUBLISHED:
        raise Conflict(
            gettext("Only a published regulation gets a new version."), code="not_published"
        )
    try:
        number = str(int(regulation.version) + 1)
    except ValueError:
        number = f"{regulation.version}.1"
    with transaction.atomic():
        draft = Regulation.objects.create(
            title=regulation.title,
            body=regulation.body,
            file=regulation.file,
            category=regulation.category,
            version=number,
            requires_acknowledgement=regulation.requires_acknowledgement,
            is_public=regulation.is_public,
            replaces=regulation,
            created_by=meta.actor,
        )
        record(meta, "regulation.new_version", draft, new={"replaces": regulation.pk})
    return draft


def publish_regulation(meta: RequestMeta, regulation: Regulation) -> Regulation:
    _require(meta.actor, "regulations.manage")
    if regulation.status != Regulation.Status.DRAFT:
        raise Conflict(gettext("Already published."), code="published")
    if not regulation.body.strip() and regulation.file_id is None:
        raise ValidationError({"body": [gettext("Write the text or attach the PDF.")]})
    with transaction.atomic():
        regulation.status = Regulation.Status.PUBLISHED
        regulation.published_at = timezone.now()
        regulation.save(update_fields=["status", "published_at", "updated_at"])
        if regulation.replaces_id:
            Regulation.objects.filter(pk=regulation.replaces_id).update(
                status=Regulation.Status.SUPERSEDED
            )
        record(meta, "regulation.publish", regulation)
        notify_audience(
            {"type": "college", "members": "students"},
            category=Category.COLLEGE,
            title=(
                f"{regulation.title} — مطلوب إقرارك"
                if regulation.requires_acknowledgement
                else f"لائحة جديدة: {regulation.title}"
            ),
            body="شؤون الطلاب",
            action_url=f"/regulations/{regulation.public_id}",
        )
    return regulation


def acknowledge(meta: RequestMeta, regulation: Regulation) -> RegulationAcknowledgement:
    record_ = StudentRecord.objects.filter(user=meta.actor).first()
    if record_ is None or regulation.status != Regulation.Status.PUBLISHED:
        raise NotFound()
    if not regulation.requires_acknowledgement:
        raise ValidationError({"detail": [gettext("This regulation needs no acknowledgement.")]})
    try:
        with transaction.atomic():
            ack = RegulationAcknowledgement.objects.create(
                regulation=regulation, student_record=record_
            )
            record(meta, "regulation.acknowledge", regulation, department_id=record_.department_id)
    except IntegrityError:
        raise Conflict(gettext("Already acknowledged."), code="already_acknowledged") from None
    return ack


# ─── Cases ────────────────────────────────────────────────────────────────


def _event(case: StudentCase, kind: str, by, note: str = "") -> None:
    StudentCaseEvent.objects.create(case=case, kind=kind, by=by, note=note)


def _attachments(ids: list) -> list[str]:
    ids = [str(i) for i in ids or []]
    found = StoredFile.objects.filter(public_id__in=ids, purpose=Purpose.CASE).count()
    if found != len(set(ids)):
        raise ValidationError({"attachments": [gettext("Upload each attachment first.")]})
    return ids


def open_case(
    meta: RequestMeta, *, student_record, kind, title, description="", attachments=None
) -> StudentCase:
    _require(meta.actor, "cases.manage")
    with transaction.atomic():
        case = StudentCase.objects.create(
            student_record=student_record,
            kind=kind,
            title=title,
            description=description,
            attachments=_attachments(attachments),
            opened_by=meta.actor,
        )
        _event(case, StudentCaseEvent.Kind.OPENED, meta.actor)
        record(
            meta, "case.open", case, new={"kind": kind}, department_id=student_record.department_id
        )
    return case


def add_note(meta: RequestMeta, case: StudentCase, note: str) -> StudentCase:
    _require(meta.actor, "cases.manage")
    if not note.strip():
        raise ValidationError({"note": [gettext("Write the note.")]})
    with transaction.atomic():
        _event(case, StudentCaseEvent.Kind.NOTE, meta.actor, note)
        # The note itself stays in the case; the log only says one was added.
        record(meta, "case.note", case, department_id=case.student_record.department_id)
    return case


def decide(
    meta: RequestMeta,
    case: StudentCase,
    *,
    decision,
    sanction="",
    effective_from=None,
    effective_to=None,
) -> StudentCase:
    _require(meta.actor, "cases.manage")
    if case.status == StudentCase.Status.CLOSED:
        raise Conflict(gettext("Reopen the case first."), code="closed")
    if effective_from and effective_to and effective_to < effective_from:
        raise ValidationError({"effective_to": [gettext("Must be after the start date.")]})
    with transaction.atomic():
        old = snapshot(case)
        case.decision, case.sanction = decision, sanction
        case.effective_from, case.effective_to = effective_from, effective_to
        case.status = StudentCase.Status.DECIDED
        case.save()
        _event(case, StudentCaseEvent.Kind.DECIDED, meta.actor, decision)
        record(
            meta,
            "case.decide",
            case,
            old=old,
            new=snapshot(case),
            department_id=case.student_record.department_id,
        )
    return case


def publish_case(meta: RequestMeta, case: StudentCase) -> StudentCase:
    _require(meta.actor, "cases.manage")
    if case.published_to_student:
        raise Conflict(gettext("Already visible to the student."), code="published")
    with transaction.atomic():
        case.published_to_student = True
        case.save(update_fields=["published_to_student", "updated_at"])
        _event(case, StudentCaseEvent.Kind.PUBLISHED, meta.actor)
        record(meta, "case.publish", case, department_id=case.student_record.department_id)
        if case.student_record.user_id:
            notify(
                [case.student_record.user],
                category=Category.ACCOUNT,
                title="قرار من شؤون الطلاب",
                body=case.title,
                action_url=f"/my-cases/{case.public_id}",
                channels=["inapp", "push", "email"],
            )
    return case


def set_closed(meta: RequestMeta, case: StudentCase, closed: bool) -> StudentCase:
    _require(meta.actor, "cases.manage")
    target = (
        StudentCase.Status.CLOSED
        if closed
        else (StudentCase.Status.DECIDED if case.decision else StudentCase.Status.OPEN)
    )
    if (case.status == StudentCase.Status.CLOSED) == closed:
        raise Conflict(gettext("Nothing to change."), code="no_change")
    with transaction.atomic():
        case.status = target
        case.save(update_fields=["status", "updated_at"])
        _event(
            case,
            StudentCaseEvent.Kind.CLOSED if closed else StudentCaseEvent.Kind.REOPENED,
            meta.actor,
        )
        record(
            meta,
            "case.close" if closed else "case.reopen",
            case,
            department_id=case.student_record.department_id,
        )
    return case


# ─── Misconduct reports ───────────────────────────────────────────────────


def report_misconduct(
    meta: RequestMeta, *, offering, student_record, evidence, attempt=None
) -> MisconductReport:
    user = meta.actor
    teaches = OfferingInstructor.objects.filter(offering=offering, user=user).exists()
    if not (teaches or rbac.can(user, "learning.manage", offering.course.department_id)):
        raise PermissionDenied(gettext("You can report only in courses you teach or manage."))
    if not Enrollment.objects.filter(offering=offering, student_record=student_record).exists():
        raise ValidationError({"student_record": [gettext("This student is not in the course.")]})
    if attempt is not None and (
        attempt.student_record_id != student_record.pk or attempt.exam.offering_id != offering.pk
    ):
        raise ValidationError(
            {"attempt": [gettext("The attempt belongs to another student or course.")]}
        )
    with transaction.atomic():
        report = MisconductReport.objects.create(
            offering=offering,
            student_record=student_record,
            reported_by=user,
            evidence=evidence,
            attempt=attempt,
        )
        record(meta, "misconduct.report", report, department_id=offering.course.department_id)
        staff = get_user_model().objects.filter(
            is_active=True, role_assignments__role=Role.STUDENT_AFFAIRS
        )
        notify(
            staff,
            category=Category.COLLEGE,
            title=f"بلاغ غش في {offering.course.code}",
            body=student_record.full_name_ar,
            action_url=f"/misconduct-reports/{report.public_id}",
        )
    return report


def resolve_report(
    meta: RequestMeta, report: MisconductReport, *, convert: bool, note: str = ""
) -> MisconductReport:
    _require(meta.actor, "cases.manage")
    if report.status != MisconductReport.Status.NEW:
        raise Conflict(gettext("Already handled."), code="handled")
    with transaction.atomic():
        if convert:
            case = open_case(
                meta,
                student_record=report.student_record,
                kind=StudentCase.Kind.EXAM_MISCONDUCT,
                title=f"بلاغ غش — {report.offering.course.code}",
                description=report.evidence,
            )
            report.case = case
            report.status = MisconductReport.Status.CONVERTED
        else:
            report.status = MisconductReport.Status.DISMISSED
        report.save(update_fields=["case", "status", "updated_at"])
        record(
            meta,
            "misconduct.convert" if convert else "misconduct.dismiss",
            report,
            new={"note": note},
            department_id=report.offering.course.department_id,
        )
    return report


# ─── Student status (suspend / reinstate) ─────────────────────────────────


def set_student_status(
    meta: RequestMeta, student: StudentRecord, *, status: str, reason: str
) -> StudentRecord:
    _require(meta.actor, "students.status")
    if status not in (StudentRecord.Status.ACTIVE, StudentRecord.Status.SUSPENDED):
        raise ValidationError({"status": [gettext("Student affairs suspends or reinstates only.")]})
    if not reason.strip():
        raise ValidationError({"reason": [gettext("A reason is required.")]})
    if student.status == status:
        raise Conflict(gettext("The student already has this status."), code="no_change")
    with transaction.atomic():
        old = student.status
        student.status = status
        student.save(update_fields=["status", "updated_at"])
        record(
            meta,
            "student.status",
            student,
            old={"status": old},
            new={"status": status, "reason": reason},
            department_id=student.department_id,
        )
    return student
