"""Exam building, server-timed attempts, grading and statistics (docs/05 §8.5)."""

from __future__ import annotations

import random
import statistics
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from audit.services import RequestMeta, record, snapshot
from core.errors import Conflict, Invalid
from learning.services import require
from notifications.models import Category
from notifications.services import notify_audience
from students.models import StudentRecord

from .models import Choice, Exam, ExamAttempt, Question, StudentAnswer
from .question_types import REGISTRY

A = ExamAttempt.Status
OPEN_STATES = (A.IN_PROGRESS,)
DONE_STATES = (A.SUBMITTED, A.AUTO_SUBMITTED)


def _dept(exam: Exam) -> int:
    return exam.offering.course.department_id


def _editable(exam: Exam) -> None:
    if exam.status != Exam.Status.DRAFT and exam.attempts.exists():
        raise Conflict("Students have started this exam; questions are locked.", code="locked")


# ─── Building ─────────────────────────────────────────────────────────────


def save_exam(meta: RequestMeta, exam: Exam | None, **data) -> Exam:
    offering = data.get("offering") or exam.offering
    require(meta.actor, offering, "edit")
    with transaction.atomic():
        if exam is None:
            exam = Exam.objects.create(created_by=meta.actor, **data)
            record(meta, "exam.create", exam, new=snapshot(exam), department_id=_dept(exam))
            return exam
        if exam.status in (Exam.Status.CLOSED, Exam.Status.ARCHIVED):
            raise Conflict("A closed exam cannot change.", code="closed")
        old = snapshot(exam)
        for field, value in data.items():
            setattr(exam, field, value)
        exam.save()
        record(meta, "exam.update", exam, old=old, new=snapshot(exam), department_id=_dept(exam))
    return exam


def save_question(
    meta: RequestMeta, exam: Exam, question: Question | None, *, choices=None, **data
) -> Question:
    require(meta.actor, exam.offering, "edit")
    _editable(exam)
    with transaction.atomic():
        if question is None:
            order = (exam.questions.aggregate(m=Max("order"))["m"] or 0) + 1
            question = Question.objects.create(exam=exam, order=data.pop("order", order), **data)
        else:
            for field, value in data.items():
                setattr(question, field, value)
            question.save()
        if choices is not None:
            question.choices.all().delete()
            Choice.objects.bulk_create(
                [Choice(question=question, order=i, **c) for i, c in enumerate(choices, start=1)]
            )
        record(
            meta,
            "exam.question_save",
            exam,
            new={"question": question.pk},
            department_id=_dept(exam),
        )
    return question


def delete_question(meta: RequestMeta, question: Question) -> None:
    exam = question.exam
    require(meta.actor, exam.offering, "edit")
    _editable(exam)
    with transaction.atomic():
        record(
            meta,
            "exam.question_delete",
            exam,
            old={"question": question.pk},
            department_id=_dept(exam),
        )
        question.delete()


def reorder(meta: RequestMeta, exam: Exam, ids: list[int]) -> None:
    require(meta.actor, exam.offering, "edit")
    _editable(exam)
    existing = set(exam.questions.values_list("pk", flat=True))
    if set(ids) != existing or len(ids) != len(existing):
        raise ValidationError({"order": ["List every question exactly once."]})
    with transaction.atomic():
        for position, pk in enumerate(ids, start=1):
            Question.objects.filter(pk=pk).update(order=position)


def problems(exam: Exam) -> list[str]:
    """What stops publishing (shown in the builder as warnings)."""
    found = []
    questions = list(exam.questions.prefetch_related("choices"))
    if not questions:
        found.append("Add at least one question.")
    for index, q in enumerate(questions, start=1):
        for message in REGISTRY[q.type].validate(q, list(q.choices.all())):
            found.append(f"Question {index}: {message}")
    total = sum((q.marks for q in questions), Decimal(0))
    if exam.pass_marks > total:
        found.append("The pass mark is above the total marks.")
    if exam.duration_minutes > (exam.closes_at - exam.opens_at).total_seconds() / 60:
        found.append("The attempt is longer than the window.")
    return found


def publish(meta: RequestMeta, exam: Exam) -> Exam:
    require(meta.actor, exam.offering, "publish")
    if exam.status != Exam.Status.DRAFT:
        raise Conflict("Only a draft can be published.", code="not_draft")
    found = problems(exam)
    if found:
        raise Invalid({"detail": found}, code="not_ready")
    with transaction.atomic():
        exam.status = Exam.Status.PUBLISHED
        exam.save(update_fields=["status", "updated_at"])
        record(meta, "exam.publish", exam, department_id=_dept(exam))
        opens = timezone.localtime(exam.opens_at).strftime("%Y-%m-%d %H:%M")
        notify_audience(
            {"type": "offering", "ids": [exam.offering_id]},
            category=Category.COURSE,
            title=f"اختبار جديد: {exam.title}",
            body=f"{exam.offering.course.name_ar} · يفتح {opens}",
            action_url=f"/exams/{exam.public_id}",
        )
    return exam


def close(meta: RequestMeta, exam: Exam) -> Exam:
    require(meta.actor, exam.offering, "publish")
    if exam.status != Exam.Status.PUBLISHED:
        raise Conflict("Only a published exam can be closed.", code="not_published")
    with transaction.atomic():
        for attempt in exam.attempts.filter(status=A.IN_PROGRESS):
            _finish(attempt, A.AUTO_SUBMITTED)
        exam.status = Exam.Status.CLOSED
        exam.save(update_fields=["status", "updated_at"])
        record(meta, "exam.close", exam, department_id=_dept(exam))
    return exam


def release_results(meta: RequestMeta, exam: Exam, released: bool) -> Exam:
    require(meta.actor, exam.offering, "publish")
    exam.results_released = released
    exam.save(update_fields=["results_released", "updated_at"])
    record(meta, "exam.release" if released else "exam.hide", exam, department_id=_dept(exam))
    return exam


def delete_exam(meta: RequestMeta, exam: Exam) -> None:
    found = require(meta.actor, exam.offering, "view_all")
    if not found.can_delete(meta.actor, exam):
        raise PermissionDenied("You cannot delete this exam.")
    if exam.attempts.exists():
        raise Conflict("Students attempted this exam; archive it instead.", code="in_use")
    with transaction.atomic():
        record(meta, "exam.delete", exam, old=snapshot(exam), department_id=_dept(exam))
        exam.delete()


# ─── Attempts ─────────────────────────────────────────────────────────────


def _student(user) -> StudentRecord:
    record_ = StudentRecord.objects.filter(user=user).first()
    if record_ is None:
        raise NotFound()
    return record_


def start(meta: RequestMeta, exam: Exam) -> ExamAttempt:
    require(meta.actor, exam.offering, "submit")
    student = _student(meta.actor)
    now = timezone.now()
    current = ExamAttempt.objects.filter(
        exam=exam, student_record=student, status=A.IN_PROGRESS
    ).first()
    if current is not None:
        return current  # resume after a closed tab or a lost connection
    if exam.status != Exam.Status.PUBLISHED:
        raise Invalid({"detail": ["This exam is not open."]}, code="not_open")
    if now < exam.opens_at:
        raise Invalid({"detail": ["The exam has not opened yet."]}, code="not_open")
    if now >= exam.closes_at:
        raise Invalid({"detail": ["The exam window has closed."]}, code="closed")
    used = ExamAttempt.objects.filter(exam=exam, student_record=student).count()
    if used >= exam.max_attempts:
        raise Conflict("No attempts left.", code="no_attempts")
    questions = list(exam.questions.prefetch_related("choices"))
    order = [q.pk for q in questions]
    rng = random.SystemRandom()
    if exam.shuffle_questions:
        rng.shuffle(order)
    choice_orders = {}
    for q in questions:
        ids = [c.pk for c in q.choices.all()]
        if exam.shuffle_choices:
            rng.shuffle(ids)
        choice_orders[str(q.pk)] = ids
    try:
        with transaction.atomic():
            attempt = ExamAttempt.objects.create(
                exam=exam,
                student_record=student,
                attempt_no=used + 1,
                started_at=now,
                deadline_at=min(now + timedelta(minutes=exam.duration_minutes), exam.closes_at),
                question_order=order,
                choice_orders=choice_orders,
            )
            record(meta, "exam.attempt_start", attempt, department_id=_dept(exam))
    except IntegrityError:
        # A double tap raced us: return the attempt the other request created.
        return ExamAttempt.objects.get(exam=exam, student_record=student, status=A.IN_PROGRESS)
    return attempt


def own_attempt(user, public_id) -> ExamAttempt:
    attempt = (
        ExamAttempt.objects.select_related("exam__offering__course", "student_record")
        .filter(public_id=public_id, student_record__user=user)
        .first()
    )
    if attempt is None:
        raise NotFound()
    return attempt


def _open_for_writing(attempt: ExamAttempt, now) -> None:
    if attempt.status != A.IN_PROGRESS:
        raise Conflict("This attempt was already submitted.", code="submitted")
    if now > attempt.deadline_at + timedelta(seconds=attempt.exam.grace_seconds):
        raise Invalid({"detail": ["Time is up."]}, code="time_up")


def save_answer(meta: RequestMeta, attempt: ExamAttempt, question_id: int, answer) -> StudentAnswer:
    now = timezone.now()
    _open_for_writing(attempt, now)
    if question_id not in attempt.question_order:
        raise NotFound()
    question = Question.objects.prefetch_related("choices").get(pk=question_id)
    if not attempt.exam.allow_backtrack:
        position = attempt.question_order.index(question_id)
        answered = attempt.answers.values_list("question_id", flat=True)
        furthest = max((attempt.question_order.index(q) for q in answered), default=-1)
        if position < furthest:
            raise Invalid(
                {"detail": ["Going back is not allowed in this exam."]}, code="no_backtrack"
            )
    try:
        clean = None if answer is None else REGISTRY[question.type].clean_answer(question, answer)
    except ValueError as error:
        raise ValidationError({"answer": [str(error)]}) from None
    row, _ = StudentAnswer.objects.update_or_create(
        attempt=attempt, question=question, defaults={"answer": clean, "saved_at": now}
    )
    ExamAttempt.objects.filter(pk=attempt.pk).update(last_saved_at=now)
    return row


def record_signal(attempt: ExamAttempt, kind: str) -> ExamAttempt:
    if kind not in ("blur", "offline"):
        raise ValidationError({"kind": ["Unknown signal."]})
    if attempt.status == A.IN_PROGRESS:
        meta = dict(attempt.client_meta)
        meta[kind] = int(meta.get(kind, 0)) + 1
        attempt.client_meta = meta
        attempt.save(update_fields=["client_meta", "updated_at"])
    return attempt


def _grade(attempt: ExamAttempt) -> None:
    questions = {q.pk: q for q in attempt.exam.questions.prefetch_related("choices")}
    answers = {a.question_id: a for a in attempt.answers.all()}
    for qid in attempt.question_order:
        question = questions.get(qid)
        if question is None:
            continue
        row = answers.get(qid) or StudentAnswer(
            attempt=attempt, question=question, saved_at=timezone.now()
        )
        if row.graded_by_id:  # a teacher's manual mark stays
            continue
        graded = (
            REGISTRY[question.type].grade(question, row.answer) if row.answer is not None else None
        )
        row.is_correct = graded.is_correct if graded else False
        row.marks_awarded = graded.marks if graded else Decimal(0)
        row.needs_manual = bool(graded and graded.needs_manual)
        row.save()
    _total(attempt)


def _total(attempt: ExamAttempt) -> None:
    rows = list(attempt.answers.all())
    attempt.score = sum((r.marks_awarded or Decimal(0) for r in rows), Decimal(0))
    pending = any(r.needs_manual for r in rows)
    attempt.passed = None if pending else attempt.score >= attempt.exam.pass_marks
    attempt.save(update_fields=["score", "passed", "updated_at"])


def _finish(attempt: ExamAttempt, status: str) -> ExamAttempt:
    attempt.status = status
    attempt.submitted_at = timezone.now()
    attempt.save(update_fields=["status", "submitted_at", "updated_at"])
    _grade(attempt)
    return attempt


def submit(meta: RequestMeta, attempt: ExamAttempt) -> ExamAttempt:
    """Idempotent: submitting twice returns the same graded attempt."""
    if attempt.status in DONE_STATES:
        return attempt
    if attempt.status != A.IN_PROGRESS:
        raise Conflict("This attempt is closed.", code="closed")
    with transaction.atomic():
        locked = ExamAttempt.objects.select_for_update().get(pk=attempt.pk)
        if locked.status != A.IN_PROGRESS:
            return locked
        late = timezone.now() > locked.deadline_at + timedelta(seconds=locked.exam.grace_seconds)
        _finish(locked, A.AUTO_SUBMITTED if late else A.SUBMITTED)
        record(
            meta,
            "exam.attempt_submit",
            locked,
            new={"score": str(locked.score)},
            department_id=_dept(locked.exam),
        )
    return locked


def close_expired() -> int:
    """Beat, every minute: submit attempts past deadline + grace; close ended exams."""
    now = timezone.now()
    count = 0
    for attempt in ExamAttempt.objects.filter(status=A.IN_PROGRESS).select_related("exam"):
        if now > attempt.deadline_at + timedelta(seconds=attempt.exam.grace_seconds):
            with transaction.atomic():
                _finish(attempt, A.AUTO_SUBMITTED)
            count += 1
    Exam.objects.filter(
        status=Exam.Status.PUBLISHED, closes_at__lt=now - timedelta(minutes=5)
    ).update(status=Exam.Status.CLOSED)
    return count


# ─── Teacher actions on an attempt ────────────────────────────────────────


def extend(meta: RequestMeta, attempt: ExamAttempt, minutes: int) -> ExamAttempt:
    require(meta.actor, attempt.exam.offering, "edit")
    if attempt.status != A.IN_PROGRESS:
        raise Conflict("Only a running attempt can be extended.", code="not_running")
    attempt.deadline_at += timedelta(minutes=minutes)
    attempt.save(update_fields=["deadline_at", "updated_at"])
    record(
        meta,
        "exam.attempt_extend",
        attempt,
        new={"minutes": minutes},
        department_id=_dept(attempt.exam),
    )
    return attempt


def reopen(meta: RequestMeta, attempt: ExamAttempt, minutes: int, reason: str) -> ExamAttempt:
    require(meta.actor, attempt.exam.offering, "publish")
    if not reason.strip():
        raise ValidationError({"reason": ["A reason is required."]})
    if attempt.status not in DONE_STATES:
        raise Conflict("Only a submitted attempt can be reopened.", code="not_submitted")
    if ExamAttempt.objects.filter(
        exam=attempt.exam, student_record=attempt.student_record, status=A.IN_PROGRESS
    ).exists():
        raise Conflict("The student has another attempt running.", code="running")
    with transaction.atomic():
        attempt.status = A.IN_PROGRESS
        attempt.submitted_at = None
        attempt.deadline_at = timezone.now() + timedelta(minutes=minutes)
        attempt.save(update_fields=["status", "submitted_at", "deadline_at", "updated_at"])
        record(
            meta,
            "exam.attempt_reopen",
            attempt,
            new={"minutes": minutes, "reason": reason},
            department_id=_dept(attempt.exam),
        )
    return attempt


def invalidate(meta: RequestMeta, attempt: ExamAttempt, reason: str) -> ExamAttempt:
    require(meta.actor, attempt.exam.offering, "publish")
    if not reason.strip():
        raise ValidationError({"reason": ["A reason is required."]})
    with transaction.atomic():
        attempt.status = A.INVALIDATED
        attempt.invalidation_reason = reason
        attempt.passed = False
        attempt.save(update_fields=["status", "invalidation_reason", "passed", "updated_at"])
        record(
            meta,
            "exam.attempt_invalidate",
            attempt,
            new={"reason": reason},
            department_id=_dept(attempt.exam),
        )
    return attempt


def grade_answer(meta: RequestMeta, answer: StudentAnswer, marks: Decimal) -> StudentAnswer:
    attempt = answer.attempt
    require(meta.actor, attempt.exam.offering, "grade")
    if attempt.status not in DONE_STATES:
        raise Conflict("Grade after the attempt is submitted.", code="not_submitted")
    if not 0 <= marks <= answer.question.marks:
        raise ValidationError({"marks": [f"Between 0 and {answer.question.marks}."]})
    with transaction.atomic():
        answer.marks_awarded = marks
        answer.is_correct = marks == answer.question.marks
        answer.needs_manual = False
        answer.graded_by = meta.actor
        answer.graded_at = timezone.now()
        answer.save()
        _total(attempt)
        record(
            meta,
            "exam.answer_grade",
            attempt,
            new={"question": answer.question_id, "marks": str(marks)},
            department_id=_dept(attempt.exam),
        )
    return answer


# ─── What students may see; statistics ────────────────────────────────────


def result_visible(attempt: ExamAttempt) -> bool:
    exam = attempt.exam
    if attempt.status not in DONE_STATES:
        return False
    if exam.result_visibility == Exam.Visibility.IMMEDIATE:
        return True
    if exam.result_visibility == Exam.Visibility.AFTER_CLOSE:
        return exam.status == Exam.Status.CLOSED or timezone.now() >= exam.closes_at
    return exam.results_released


def stats(exam: Exam) -> dict:
    attempts = [a for a in exam.attempts.all() if a.status in DONE_STATES and a.score is not None]
    scores = [a.score for a in attempts]
    durations = [
        (a.submitted_at - a.started_at).total_seconds() for a in attempts if a.submitted_at
    ]
    questions = list(exam.questions.all())
    rates = []
    for q in questions:
        rows = StudentAnswer.objects.filter(attempt__in=attempts, question=q)
        total = rows.count()
        right = rows.filter(is_correct=True).count()
        rates.append(
            {
                "question": q.pk,
                "order": q.order,
                "text": q.text[:120],
                "correct_rate": round(right / total, 3) if total else None,
            }
        )
    return {
        "attempts": len(attempts),
        "students": exam.offering.enrollments.filter(status="active").count(),
        "average": round(sum(scores) / len(scores), 2) if scores else None,
        "median": statistics.median(scores) if scores else None,
        "pass_rate": round(sum(1 for a in attempts if a.passed) / len(attempts), 3)
        if attempts
        else None,
        "average_seconds": round(sum(durations) / len(durations)) if durations else None,
        "questions": sorted(
            rates, key=lambda r: (r["correct_rate"] is None, r["correct_rate"] or 0)
        ),
        "needs_manual": StudentAnswer.objects.filter(attempt__exam=exam, needs_manual=True).count(),
    }
