"""Temporary review probes: assert observed faults, not desired behavior."""

# pytest discovers imported fixtures by name; this file is stored outside tests/.
# ruff: noqa: F401, F811, S101

from datetime import timedelta
from decimal import Decimal

import pytest
from accounts.rbac import Role
from admissions import services as admissions
from admissions.models import Application
from admissions.tests.test_admissions import intake
from audit.services import RequestMeta
from contacts.models import Contact
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from exams import services as exams
from exams.models import Exam, ExamAttempt
from exams.tests.test_exams import exam
from learning.tests.test_learning import _assignment, _lecture
from results import services as results
from results.models import AcademicResult, ResultCorrection
from results.tests.test_results import _upload, officer


def test_stale_answer_changes_a_submitted_exam(api, classroom, exam):
    meta = RequestMeta(actor=classroom.student)
    attempt = exams.start(meta, exam)
    stale = ExamAttempt.objects.get(pk=attempt.pk)
    question = exam.questions.get(type="true_false")
    exams.save_answer(meta, attempt, question.pk, True)
    done = exams.submit(meta, attempt)
    exams.save_answer(meta, stale, question.pk, False)
    answer = done.answers.get(question=question)
    assert answer.answer is False and answer.marks_awarded == Decimal("1")
    print("C1: submitted answer changed to False; awarded mark stayed 1")


def test_suspended_student_still_learns_and_submits(api, classroom, exam, make_user):
    lecture = _lecture(api, classroom)
    assignment = _assignment(api, classroom)
    student = api(classroom.student)
    attempt = student.post(f"/api/v1/exams/{exam.public_id}/start").data
    affairs = api(make_user(Role.STUDENT_AFFAIRS))
    assert (
        affairs.post(
            f"/api/v1/students/{classroom.record.public_id}/status",
            {"status": "suspended", "reason": "review probe"},
        ).status_code
        == 200
    )
    codes = [
        student.get(f"/api/v1/lectures/{lecture}").status_code,
        student.post(
            f"/api/v1/assignments/{assignment}/submit", {"content": "still allowed"}
        ).status_code,
        student.put(
            f"/api/v1/exam-attempts/{attempt['public_id']}/answers/{exam.questions.get(type='true_false').pk}",
            {"answer": True},
            format="json",
        ).status_code,
    ]
    assert codes == [200, 201, 204]
    print(f"C2: suspended student lecture/assignment/exam HTTP statuses = {codes}")


def test_stale_admission_decision_reverses_acceptance(intake, make_user):
    head = make_user(Role.HEAD_REGISTRAR)
    application = Application.objects.create(
        reference_no="APP-REVIEW",
        contact=Contact.objects.create(name="review", email="review@example.test"),
        intake=intake,
        full_name="review",
        status="eligible",
    )
    stale = Application.objects.get(pk=application.pk)
    admissions.transition(RequestMeta(actor=head), application, to="accepted")
    admissions.transition(RequestMeta(actor=head), stale, to="rejected", note="second request")
    application.refresh_from_db()
    assert application.status == "rejected"
    print("C3: eligible snapshots accepted then rejected; final state rejected")


def test_stale_correction_decision_reverses_approval(api, officer, classroom, term, make_user):
    batch = _upload(api(officer), term, "26-IT-0100,IT101,58,,").data["public_id"]
    assert api(officer).post(f"/api/v1/result-imports/{batch}/commit").status_code == 200
    result = AcademicResult.objects.get()
    correction = results.request_correction(
        RequestMeta(actor=officer), result, score=62, reason="review"
    )
    stale = ResultCorrection.objects.get(pk=correction.pk)
    meta = RequestMeta(actor=make_user(Role.ACADEMIC_AFFAIRS))
    results.decide_correction(meta, correction, approve=True)
    results.decide_correction(meta, stale, approve=False, note="second request")
    correction.refresh_from_db()
    result.refresh_from_db()
    assert correction.status == "rejected" and result.score == Decimal("62")
    print("C4: correction says rejected while result retains approved score 62")


def test_results_write_survives_failed_audit(api, officer, monkeypatch):
    import results.views
    from results.models import ResultDisplaySettings

    settings_ = ResultDisplaySettings.load()
    original = settings_.show_score

    def fail(*args, **kwargs):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(results.views, "record", fail)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        api(officer).patch("/api/v1/results/settings", {"show_score": not original})
    settings_.refresh_from_db()
    assert settings_.show_score is not original
    print("C5: failed HTTP request changed results settings without its audit entry")


def test_exam_list_query_growth(api, classroom):
    now = timezone.now()

    def add(n):
        for i in range(n):
            Exam.objects.create(
                offering=classroom.offering,
                title=f"review {i}",
                opens_at=now - timedelta(hours=1),
                closes_at=now + timedelta(hours=1),
                duration_minutes=30,
                status="published",
                created_by=classroom.teacher,
            )

    student = api(classroom.student)
    add(5)
    student.get("/api/v1/exams", {"page_size": 100})
    with CaptureQueriesContext(connection) as small:
        assert student.get("/api/v1/exams", {"page_size": 100}).status_code == 200
    add(15)
    with CaptureQueriesContext(connection) as large:
        assert student.get("/api/v1/exams", {"page_size": 100}).status_code == 200
    assert len(large) - len(small) == 15
    print(f"D1: student exam list 5 exams={len(small)} queries, 20 exams={len(large)} queries")
