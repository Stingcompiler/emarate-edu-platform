"""Review probes: passing means the documented faulty behavior was reproduced.
Synthetic data only. Copy temporarily under backend/core/tests to use fixtures.
"""

from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import pytest
from accounts import otp
from accounts import services as accounts
from accounts.models import OneTimeCode, RegistrationRequest, User
from accounts.rbac import Role
from admissions import services as admissions
from admissions.models import (
    AdmissionCycle,
    Application,
    ApplicationDocument,
    ProgramIntake,
)
from audit.services import RequestMeta
from conftest import PASSWORD, pdf_upload
from contacts.models import Contact
from core import backups
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from exams import services as exams
from exams.models import Exam, ExamAttempt
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from results.models import GradingScale

pytestmark = pytest.mark.django_db


@pytest.fixture
def application(term, it_program):
    now = timezone.now()
    cycle = AdmissionCycle.objects.create(
        academic_year=term.academic_year,
        name="Review",
        opens_at=now - timedelta(days=1),
        closes_at=now + timedelta(days=1),
    )
    intake = ProgramIntake.objects.create(cycle=cycle, program=it_program)
    contact = Contact.objects.create(
        name="Review Applicant", email="review@example.test"
    )
    return admissions.start(contact, intake)


@pytest.fixture
def exam_attempt(classroom):
    now = timezone.now()
    exam = Exam.objects.create(
        offering=classroom.offering,
        title="Review",
        created_by=classroom.teacher,
        opens_at=now - timedelta(minutes=5),
        closes_at=now + timedelta(hours=1),
        duration_minutes=30,
        status="published",
        pass_marks=Decimal(1),
    )
    question = exam.questions.create(
        type="true_false", text="Review", marks=Decimal(1), config={"answer": True}
    )
    attempt = exams.start(RequestMeta(actor=classroom.student), exam)
    return exam, question, attempt


def test_stale_autosave_reverts_submitted_application(application):
    stale = Application.objects.get(pk=application.pk)
    admissions.submit(application.contact, application)
    assert Application.objects.get(pk=application.pk).status == "submitted"
    admissions.update(application.contact, stale, full_name="Late autosave")
    current = Application.objects.get(pk=application.pk)
    assert current.status == "draft" and current.submitted_at is None
    print("R01: submitted -> draft; submitted_at erased by stale autosave")


def test_stale_registration_rejection_deletes_approved_account(
    make_user, make_student, it_program
):
    manager = make_user(Role.HEAD_REGISTRAR)
    pending = make_user(is_active=False)
    student = make_student(it_program, "REVIEW-001", user=pending)
    request = RegistrationRequest.objects.create(
        student_record=student, email=pending.email, status="pending_approval"
    )
    stale = RegistrationRequest.objects.select_related("student_record__user").get(
        pk=request.pk
    )
    accounts.decide_registration(RequestMeta(actor=manager), request, True)
    assert User.objects.get(pk=pending.pk).is_active
    accounts.decide_registration(
        RequestMeta(actor=manager), stale, False, "late rejection"
    )
    assert not User.objects.filter(pk=pending.pk).exists()
    student.refresh_from_db()
    assert student.user_id is None
    print("R02: stale rejection deleted an already approved account")


def test_close_overwrites_invalidation(exam_attempt, classroom):
    exam, question, attempt = exam_attempt
    exams.save_answer(RequestMeta(actor=classroom.student), attempt, question.pk, True)
    original_finish = exams._finish

    def interleave(stale_attempt, status):
        # Deterministic interleaving: close fetched its row before invalidate committed.
        fresh = ExamAttempt.objects.get(pk=stale_attempt.pk)
        exams.invalidate(
            RequestMeta(actor=classroom.teacher), fresh, "Review invalidation"
        )
        return original_finish(stale_attempt, status)

    with patch.object(exams, "_finish", side_effect=interleave):
        exams.close(RequestMeta(actor=classroom.teacher), exam)
    attempt.refresh_from_db()
    assert attempt.status == "auto_submitted" and attempt.passed is True
    assert attempt.invalidation_reason == "Review invalidation"
    print("R03: close overwrote invalidated with auto_submitted/passed=True")


def test_dropped_student_can_save_exam_answers(exam_attempt, classroom, api):
    _exam, question, attempt = exam_attempt
    classroom.record.enrollments.update(status="dropped")
    url = f"/api/v1/exam-attempts/{attempt.public_id}/answers/{question.pk}"
    reply = api(classroom.student).put(url, {"answer": True}, format="json")
    assert reply.status_code == 204, reply.data
    assert attempt.answers.get(question=question).answer is True
    print("R04: dropped enrollment still writes exam answer via HTTP 204")


def test_password_reset_keeps_old_access_cookie(make_user):
    user = make_user(Role.SYSTEM_ADMIN)
    refresh = RefreshToken.for_user(user)
    client = APIClient()
    client.cookies["access"] = str(refresh.access_token)
    _, code = otp.issue(OneTimeCode.Purpose.PASSWORD_RESET, user.email)
    accounts.reset_password(user.email, code, "Different-strong-Password-2026!")
    assert client.get("/api/v1/me").status_code == 200
    client.cookies["refresh"] = str(refresh)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    print(
        "R05: password reset revoked refresh but old access cookie still authenticates"
    )


def test_default_grading_scale_can_be_duplicated(make_user, api):
    client = api(make_user(Role.SYSTEM_ADMIN))
    body = {"program": None, "ranges": [{"min": "0", "letter": "F", "points": "0"}]}
    first = client.post("/api/v1/results/grading-scales", body, format="json")
    second = client.post(
        "/api/v1/results/grading-scales",
        {**body, "ranges": [{"min": "0", "letter": "A", "points": "4"}]},
        format="json",
    )
    assert first.status_code == second.status_code == 201, (first.data, second.data)
    assert GradingScale.objects.filter(program__isnull=True).count() == 2
    assert GradingScale.grade(GradingScale.for_program(None), Decimal(50))[0] == "F"
    print("R06: two default scales accepted, second ignored by for_program")


def test_truncated_backup_reports_success(settings, tmp_path):
    settings.BACKUP_ENCRYPTION_KEY = "review-synthetic-key"
    raw = tmp_path / "source"
    sealed = tmp_path / "sealed"
    raw.write_bytes(b"AAAABBBBCCCC")
    with patch.object(backups, "CHUNK", 4):
        backups._encrypt_file(raw, sealed, backups.fernet())
    data = sealed.read_bytes()
    end = (
        len(backups.MAGIC)
        + 4
        + int.from_bytes(data[len(backups.MAGIC) : len(backups.MAGIC) + 4], "big")
    )
    name = default_storage.save(
        "backups/review-truncated.dump.enc", ContentFile(data[:end])
    )
    assert backups.decrypt(name) == b"AAAA"
    print("R07: decrypt accepted a truncated backup (4 of 12 original bytes)")


def test_replacing_document_loses_original_on_rollback(application):
    original = admissions.add_document(
        application.contact, application, "certificate", pdf_upload("original.pdf")
    )
    name = original.file.name
    assert default_storage.exists(name)
    with pytest.raises(RuntimeError), transaction.atomic():
        with patch.object(
            ApplicationDocument.objects,
            "create",
            side_effect=RuntimeError("storage unavailable"),
        ):
            admissions.add_document(
                application.contact,
                application,
                "certificate",
                pdf_upload("replacement.pdf"),
            )
    assert ApplicationDocument.objects.filter(pk=original.pk).exists()
    assert not default_storage.exists(name)
    print("R08: database rollback restored document row but original file was deleted")


def test_numeric_replay_conflicts_with_shuffled_no_backtrack(exam_attempt, classroom):
    from core.errors import Invalid

    exam, first, attempt = exam_attempt
    second = exam.questions.create(
        type="true_false", text="Second", marks=Decimal(1), config={"answer": True}
    )
    exam.allow_backtrack = False
    exam.save(update_fields=["allow_backtrack"])
    attempt.question_order = [second.pk, first.pk]
    attempt.save(update_fields=["question_order"])
    # The browser stores numeric keys; Object.keys replays first.pk before second.pk.
    exams.save_answer(RequestMeta(actor=classroom.student), attempt, first.pk, True)
    with pytest.raises(Invalid) as failure:
        exams.save_answer(
            RequestMeta(actor=classroom.student), attempt, second.pk, True
        )
    assert failure.value.problem_code == "no_backtrack"
    assert not attempt.answers.filter(question=second).exists()
    print(
        "R11: shuffled first question rejected after numeric-ID replay advanced furthest position"
    )
