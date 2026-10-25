"""Idempotency-Key (docs/05 §7; review 2026-10-25 R21): a repeat gets the first answer and
the work is not done twice; the same key on another request is refused; a failed first request
keeps nothing; an exam submission reopened since is refused, not answered with «submitted»."""

from audit.services import RequestMeta
from exams import services as exam_services
from exams.models import ExamAttempt
from exams.tests.test_exams import exam  # noqa: F401  (fixture)
from notifications.models import Notification

SEND = "/api/v1/notifications/sent"


def test_a_repeated_send_is_answered_once(api, classroom, django_capture_on_commit_callbacks):
    teacher = api(classroom.teacher)
    body = {
        "title": "لقاء",
        "body": "الأربعاء",
        "category": "course",
        "audience": {"type": "offering", "ids": [classroom.offering.pk]},
    }
    with django_capture_on_commit_callbacks(execute=True):
        first = teacher.post(SEND, body, format="json", HTTP_IDEMPOTENCY_KEY="send-1")
        again = teacher.post(SEND, body, format="json", HTTP_IDEMPOTENCY_KEY="send-1")
    assert first.status_code == again.status_code == 201
    assert again.data["public_id"] == str(first.data["public_id"])
    assert Notification.objects.count() == 1
    other = {**body, "title": "شيء آخر"}
    reused = teacher.post(SEND, other, format="json", HTTP_IDEMPOTENCY_KEY="send-1")
    assert reused.status_code == 422
    # Without a key nothing changes: each request is its own.
    with django_capture_on_commit_callbacks(execute=True):
        teacher.post(SEND, body, format="json")
    assert Notification.objects.count() == 2


def test_a_failed_first_request_keeps_nothing(api, classroom, django_capture_on_commit_callbacks):
    teacher = api(classroom.teacher)
    bad = {"title": "", "category": "course", "audience": {"type": "college"}}
    assert teacher.post(SEND, bad, format="json", HTTP_IDEMPOTENCY_KEY="k").status_code in (
        400,
        403,
    )
    good = {
        "title": "لقاء",
        "category": "course",
        "audience": {"type": "offering", "ids": [classroom.offering.pk]},
    }
    with django_capture_on_commit_callbacks(execute=True):
        retried = teacher.post(SEND, good, format="json", HTTP_IDEMPOTENCY_KEY="k")
    assert retried.status_code == 201


def test_an_exam_submission_reopened_since_is_refused(api, classroom, exam):  # noqa: F811
    student = api(classroom.student)
    attempt = exam_services.start(RequestMeta(actor=classroom.student), exam)
    url = f"/api/v1/exam-attempts/{attempt.public_id}/submit"
    first = student.post(url, HTTP_IDEMPOTENCY_KEY="submit-1")
    assert first.status_code == 200 and first.data["status"] == "submitted"
    assert student.post(url, HTTP_IDEMPOTENCY_KEY="submit-1").data == first.data
    exam_services.reopen(
        RequestMeta(actor=classroom.teacher), ExamAttempt.objects.get(pk=attempt.pk), 10, "انقطاع"
    )
    late = student.post(url, HTTP_IDEMPOTENCY_KEY="submit-1")
    assert late.status_code == 409 and late.data["code"] == "stale"
    assert ExamAttempt.objects.get(pk=attempt.pk).status == "in_progress"
