"""Notifications: audiences, fan-out, push, email, automatic events, HR notices."""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.core import mail
from django.utils import timezone

from academic.models import Enrollment
from accounts.rbac import Role
from notifications import push
from notifications.models import (
    HRNotice,
    Notification,
    NotificationPreference,
    NotificationRecipient,
    Outbox,
    PushSubscription,
)

SEND = "/api/v1/notifications/sent"


@pytest.fixture(autouse=True)
def vapid(settings):
    keys = push._generate()
    settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = keys["public"], keys["private"]
    push.keys.cache_clear()
    yield
    push.keys.cache_clear()


@pytest.fixture
def pushed(monkeypatch):
    """Record web pushes instead of calling the browser vendors' push services."""
    import pywebpush

    calls = []

    def fake_webpush(subscription_info, data, **kwargs):
        calls.append({"endpoint": subscription_info["endpoint"], "data": data, **kwargs})

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    return calls


def _subscribe(api, user, n=1):
    endpoint = f"https://fcm.googleapis.com/fcm/send/device-{user.pk}-{n}"
    response = api(user).post(
        "/api/v1/push/subscriptions",
        {"endpoint": endpoint, "keys": {"p256dh": "BPk" + "a" * 84, "auth": "x" * 22}},
        format="json",
    )
    assert response.status_code == 201
    return endpoint


def _send(api, user, audience, capture, **extra):
    body = {
        "title": "لقاء المادة",
        "body": "الأربعاء 11:00",
        "category": "course",
        "audience": audience,
        **extra,
    }
    with capture(execute=True):
        return api(user).post(SEND, body, format="json")


def _count(response) -> int:
    """Recipients reached (the fan-out runs after the response, on commit)."""
    return Notification.objects.get(public_id=response.data["public_id"]).recipients_count


def test_teacher_notifies_their_course_and_push_arrives(
    api,
    classroom,
    pushed,
    make_user,
    make_student,
    ba_offering,
    ba_program,
    django_capture_on_commit_callbacks,
):
    """Phase 3 acceptance: a teacher notifies a course → push reaches subscribed devices."""
    endpoint = _subscribe(api, classroom.student)
    outsider = make_user(Role.STUDENT)
    record = make_student(ba_program, "26-BA-0200", user=outsider)
    Enrollment.objects.create(offering=ba_offering, student_record=record)
    _subscribe(api, outsider)

    response = _send(
        api,
        classroom.teacher,
        {"type": "offering", "ids": [classroom.offering.pk]},
        django_capture_on_commit_callbacks,
        action_url="/courses/x",
        channels=["inapp", "push"],
    )
    assert response.status_code == 201, response.data
    assert _count(response) == 1
    assert [call["endpoint"] for call in pushed] == [endpoint]
    assert "لقاء المادة" in pushed[0]["data"] and "/courses/x" in pushed[0]["data"]
    assert pushed[0]["vapid_claims"]["sub"].startswith("mailto:")
    inbox = api(classroom.student).get("/api/v1/notifications").data["results"]
    assert [item["title"] for item in inbox] == ["لقاء المادة"]
    assert api(outsider).get("/api/v1/notifications").data["count"] == 0
    assert api(classroom.teacher).get("/api/v1/notifications").data["count"] == 0  # not the sender
    sent = api(classroom.teacher).get(SEND).data["results"]
    assert sent[0]["recipients_count"] == 1


@pytest.mark.parametrize(
    "audience",
    [
        {"type": "department", "ids": [0]},  # replaced with the IT department below
        {"type": "college", "members": "students"},
        {"type": "users", "ids": ["00000000-0000-0000-0000-000000000000"]},
    ],
)
def test_teachers_cannot_reach_beyond_their_courses(api, classroom, it_dept, ba_offering, audience):
    if audience["type"] == "department":
        audience = {"type": "department", "ids": [it_dept.pk]}
    assert (
        api(classroom.teacher)
        .post(SEND, {"title": "x", "category": "course", "audience": audience}, format="json")
        .status_code
        == 403
    )
    other = {"type": "offering", "ids": [classroom.offering.pk, ba_offering.pk]}
    assert (
        api(classroom.teacher)
        .post(SEND, {"title": "x", "category": "course", "audience": other}, format="json")
        .status_code
        == 403
    )


def test_ta_needs_permission(api, classroom, django_capture_on_commit_callbacks):
    audience = {"type": "offering", "ids": [classroom.offering.pk]}
    assert _send(api, classroom.ta, audience, django_capture_on_commit_callbacks).status_code == 403
    classroom.offering.ta_can_notify = True
    classroom.offering.save()
    assert _send(api, classroom.ta, audience, django_capture_on_commit_callbacks).status_code == 201


def test_department_roles_and_college_roles(
    api, classroom, make_user, it_dept, ba_dept, it_program, django_capture_on_commit_callbacks
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    cohort = {"type": "program", "ids": [it_program.pk], "level": 1}
    response = _send(api, manager, cohort, django_capture_on_commit_callbacks)
    assert _count(response) == 1
    other = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert _send(api, other, cohort, django_capture_on_commit_callbacks).status_code == 403

    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    staff = {"type": "role", "roles": ["teacher", "ta"]}
    assert _count(_send(api, affairs, staff, django_capture_on_commit_callbacks)) == 2
    students = {"type": "college", "members": "students"}
    assert _send(api, affairs, students, django_capture_on_commit_callbacks).status_code == 403
    head = make_user(Role.HEAD_REGISTRAR)
    assert _send(api, head, students, django_capture_on_commit_callbacks).status_code == 201
    assert (
        _send(api, make_user(Role.HR), students, django_capture_on_commit_callbacks).status_code
        == 403
    )


def test_preferences_steer_channels(api, classroom, pushed, django_capture_on_commit_callbacks):
    _subscribe(api, classroom.student)
    prefs = api(classroom.student).get("/api/v1/notifications/preferences").data
    assert {p["category"] for p in prefs} >= {"course", "college", "results"}
    course = [{"category": "course", "inapp": True, "push": False, "email": True}]
    assert (
        api(classroom.student)
        .put("/api/v1/notifications/preferences", course, format="json")
        .status_code
        == 200
    )
    _send(
        api,
        classroom.teacher,
        {"type": "offering", "ids": [classroom.offering.pk]},
        django_capture_on_commit_callbacks,
        channels=["inapp", "push", "email"],
    )
    assert pushed == []
    assert Outbox.objects.get().status == "sent"
    assert mail.outbox[-1].to == [classroom.student.email]


def test_dead_subscriptions_are_removed(
    api, classroom, monkeypatch, django_capture_on_commit_callbacks
):
    import pywebpush

    _subscribe(api, classroom.student)

    def gone(*args, **kwargs):
        raise pywebpush.WebPushException("gone", response=SimpleNamespace(status_code=410))

    monkeypatch.setattr(pywebpush, "webpush", gone)
    _send(
        api,
        classroom.teacher,
        {"type": "offering", "ids": [classroom.offering.pk]},
        django_capture_on_commit_callbacks,
    )
    assert not PushSubscription.objects.exists()


def test_inbox_read_and_counts(api, classroom, django_capture_on_commit_callbacks):
    audience = {"type": "offering", "ids": [classroom.offering.pk]}
    for _ in range(2):
        _send(api, classroom.teacher, audience, django_capture_on_commit_callbacks)
    student = api(classroom.student)
    assert student.get("/api/v1/notifications/unread-count").data == {
        "count": 2,
        "by_category": {"course": 2},
    }
    first = student.get("/api/v1/notifications").data["results"][0]["id"]
    assert student.post(f"/api/v1/notifications/{first}/read").data["read_at"] is not None
    assert student.get("/api/v1/notifications/unread-count").data["count"] == 1
    assert student.get("/api/v1/notifications", {"read_at__isnull": True}).data["count"] == 1
    assert student.post("/api/v1/notifications/read-all").data["count"] == 0
    # Someone else's inbox item is not reachable.
    assert api(classroom.teacher).post(f"/api/v1/notifications/{first}/read").status_code == 404


def test_audience_options_and_preview(api, classroom):
    options = api(classroom.teacher).get(f"{SEND}/audiences").data
    assert [o["count"] for o in options] == [1]
    assert options[0]["audience"] == {"type": "offering", "ids": [classroom.offering.pk]}
    preview = api(classroom.teacher).post(
        f"{SEND}/preview", {"audience": options[0]["audience"]}, format="json"
    )
    assert preview.data == {"count": 1}


def test_fan_out_is_idempotent(classroom, django_capture_on_commit_callbacks):
    from notifications import services, tasks

    with django_capture_on_commit_callbacks(execute=True):
        notification = services.notify([classroom.student], category="course", title="مرة")
    tasks.fan_out(notification.pk)
    assert NotificationRecipient.objects.filter(notification=notification).count() == 1


def test_automatic_notifications(
    api, classroom, make_user, it_dept, django_capture_on_commit_callbacks
):
    teacher = api(classroom.teacher)
    with django_capture_on_commit_callbacks(execute=True):
        lecture = teacher.post(
            "/api/v1/lectures", {"offering": classroom.offering.pk, "title_ar": "المحاضرة 3"}
        ).data
        teacher.post(f"/api/v1/lectures/{lecture['public_id']}/publish")
        teacher.post(f"/api/v1/lectures/{lecture['public_id']}/unpublish")
        teacher.post(f"/api/v1/lectures/{lecture['public_id']}/publish")  # no second notice
        assignment = teacher.post(
            "/api/v1/assignments",
            {
                "offering": classroom.offering.pk,
                "title": "واجب 2",
                "submission_types": ["text"],
                "due_at": (timezone.now() + timedelta(days=2)).isoformat(),
            },
            format="json",
        ).data
        teacher.post(f"/api/v1/assignments/{assignment['public_id']}/publish")
        submission = (
            api(classroom.student)
            .post(
                f"/api/v1/assignments/{assignment['public_id']}/submit",
                {"content": "حل"},
                format="json",
            )
            .data
        )
        teacher.put(f"/api/v1/submissions/{submission['public_id']}/grade", {"score": "9"})
    notices = api(classroom.student).get("/api/v1/notifications").data["results"]
    titles = [n["title"] for n in notices]
    assert titles == ["تم تصحيح واجب 2", "واجب جديد: واجب 2", "محاضرة جديدة: المحاضرة 3"]
    assert notices[0]["body"].startswith("الدرجة 9 من ")  # no trailing ".00"
    assert ".00" not in notices[0]["body"]

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    teacher2 = make_user(Role.TEACHER)
    from academic.models import DepartmentMembership

    DepartmentMembership.objects.create(department=it_dept, user=teacher2, kind="teacher")
    with django_capture_on_commit_callbacks(execute=True):
        api(manager).post(
            f"/api/v1/offerings/{classroom.offering.pk}/instructors",
            {"user": str(teacher2.public_id), "role": "teacher"},
        )
    assert api(teacher2).get("/api/v1/notifications").data["results"][0]["title"].startswith("عُيّنت")


def test_registration_pending_reaches_the_department(
    api, make_user, make_student, it_dept, it_program, django_capture_on_commit_callbacks
):
    from conftest import PASSWORD, last_code

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    make_student(it_program, "26-IT-0300", name="سلمى عمر")
    with django_capture_on_commit_callbacks(execute=True):
        start = (
            api()
            .post(
                "/api/public/registration/start",
                {
                    "university_number": "26-IT-0300",
                    "full_name": "سلمى عمر",
                    "email": "s@gmail.test",
                },
            )
            .data
        )
    api().post(
        "/api/public/registration/verify", {"request_id": start["request_id"], "code": last_code()}
    )
    with django_capture_on_commit_callbacks(execute=True):
        api().post(
            "/api/public/registration/complete",
            {"request_id": start["request_id"], "password": PASSWORD},
        )
    item = api(manager).get("/api/v1/notifications").data["results"][0]
    assert item["category"] == "account" and "سلمى عمر" in item["body"]


def test_due_reminders_skip_submitters_and_run_once(
    api, classroom, make_user, make_student, it_program, django_capture_on_commit_callbacks
):
    from learning.models import Assignment, Submission
    from notifications.tasks import remind_due_assignments

    late_student = make_user(Role.STUDENT)
    record = make_student(it_program, "26-IT-0400", user=late_student)
    Enrollment.objects.create(offering=classroom.offering, student_record=record)
    assignment = Assignment.objects.create(
        offering=classroom.offering,
        title="قريب",
        due_at=timezone.now() + timedelta(hours=10),
        submission_types=["text"],
        status="published",
        created_by=classroom.teacher,
    )
    Submission.objects.create(
        assignment=assignment, student_record=classroom.record, first_submitted_at=timezone.now()
    )
    with django_capture_on_commit_callbacks(execute=True):
        assert remind_due_assignments() == 1
        assert remind_due_assignments() == 0
    assert api(late_student).get("/api/v1/notifications").data["count"] == 1
    assert api(classroom.student).get("/api/v1/notifications").data["count"] == 0


def test_outbox_retries_then_gives_up(monkeypatch, db):
    from notifications import tasks

    Outbox.objects.create(to="x@ecst.test", subject="s", body="b")

    def broken(*args, **kwargs):
        raise OSError("smtp down")

    monkeypatch.setattr(tasks, "send_mail", broken)
    tasks.deliver_outbox()
    row = Outbox.objects.get()
    assert row.attempts == 1 and row.status == "pending" and row.next_try_at > timezone.now()
    for _ in range(tasks.MAX_ATTEMPTS):
        Outbox.objects.update(next_try_at=None)
        tasks.deliver_outbox()
    row.refresh_from_db()
    assert row.status == "failed" and "smtp down" in row.last_error


def test_hr_notice(api, classroom, make_user, django_capture_on_commit_callbacks):
    hr = make_user(Role.HR)
    body = {
        "teacher": str(classroom.teacher.public_id),
        "subject": "تأخر رفع المحاضرات",
        "body": "نرجو الالتزام.",
        "requires_ack": True,
    }
    assert api(classroom.ta).post("/api/v1/hr-notices", body).status_code == 403
    with django_capture_on_commit_callbacks(execute=True):
        created = api(hr).post("/api/v1/hr-notices", body)
    assert created.status_code == 201, created.data
    notice = created.data["public_id"]
    inbox = api(classroom.teacher).get("/api/v1/notifications").data["results"]
    assert inbox[0]["category"] == "hr" and inbox[0]["kind"] == "hr_notice"
    assert api(classroom.ta).get(f"/api/v1/hr-notices/{notice}").status_code == 404
    assert (
        api(classroom.teacher).post(f"/api/v1/hr-notices/{notice}/acknowledge").status_code == 200
    )
    assert (
        api(classroom.teacher).post(f"/api/v1/hr-notices/{notice}/acknowledge").status_code == 409
    )
    assert HRNotice.objects.get().acknowledged_at is not None
    student_body = {**body, "teacher": str(classroom.student.public_id)}
    assert api(hr).post("/api/v1/hr-notices", student_body).status_code == 400


def test_dev_vapid_keys_are_created_once(settings, tmp_path, monkeypatch):
    settings.DEBUG = True
    settings.VAPID_PUBLIC_KEY = settings.VAPID_PRIVATE_KEY = ""
    monkeypatch.setattr(push, "_DEV_KEYS", tmp_path / "vapid.json")
    push.keys.cache_clear()
    first = push.keys()
    push.keys.cache_clear()
    assert push.keys() == first and len(first["public"]) > 80


def test_push_unsubscribe_and_config(api, classroom):
    endpoint = _subscribe(api, classroom.student)
    config = api(classroom.student).get("/api/v1/push/config").data
    assert config["enabled"] is True and config["public_key"]
    other = api(classroom.teacher).post("/api/v1/push/subscriptions/remove", {"endpoint": endpoint})
    assert other.status_code == 204 and PushSubscription.objects.exists()  # not theirs
    api(classroom.student).post("/api/v1/push/subscriptions/remove", {"endpoint": endpoint})
    assert not PushSubscription.objects.exists()
    assert Notification.objects.count() == 0
    assert NotificationPreference.objects.count() == 0
