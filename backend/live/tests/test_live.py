from datetime import timedelta

from django.utils import timezone

from accounts.rbac import Role
from core.crypto import decrypt
from live.models import LiveSession
from live.services import remind_upcoming

URL = "/api/v1/live-sessions"
LINK = "https://teams.microsoft.com/l/meetup-join/abc"


def _body(offering, minutes=60, **extra):
    now = timezone.now()
    return {
        "scope": "offering",
        "offering": offering.pk,
        "title": "مراجعة الفصل 3",
        "provider": "teams",
        "join_url": LINK,
        "starts_at": (now + timedelta(minutes=minutes)).isoformat(),
        "ends_at": (now + timedelta(minutes=minutes + 60)).isoformat(),
        **extra,
    }


def test_link_is_encrypted_hidden_and_timed(api, classroom, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        created = api(classroom.teacher).post(URL, _body(classroom.offering), format="json")
    assert created.status_code == 201, created.data
    assert "join_url" not in created.data
    session = LiveSession.objects.get()
    assert LINK not in session.join_url_encrypted and decrypt(session.join_url_encrypted) == LINK
    student = api(classroom.student)
    assert student.get(URL).data["count"] == 1
    join = f"{URL}/{session.public_id}/join"
    early = student.get(join)
    assert early.status_code == 400
    assert api(classroom.teacher).get(join).data["url"] == LINK  # hosts can test the link anytime
    LiveSession.objects.filter(pk=session.pk).update(
        starts_at=timezone.now() + timedelta(minutes=10)
    )
    assert student.get(join).data["url"] == LINK
    assert (
        api(classroom.student)
        .get("/api/v1/notifications")
        .data["results"][0]["title"]
        .startswith("جلسة بث")
    )


def test_scope_rules(api, classroom, make_user, it_program, ba_dept, make_student, ba_program):
    from academic.models import Enrollment

    assert (
        api(classroom.student).post(URL, _body(classroom.offering), format="json").status_code
        == 403
    )
    outsider = make_user(Role.STUDENT)
    make_student(ba_program, "26-BA-0900", user=outsider)
    session = api(classroom.teacher).post(URL, _body(classroom.offering), format="json").data
    assert api(outsider).get(f"{URL}/{session['public_id']}").status_code == 404
    assert api(outsider).get(f"{URL}/{session['public_id']}/join").status_code == 404
    cohort = {
        **_body(classroom.offering),
        "scope": "cohort",
        "offering": None,
        "program": it_program.pk,
        "level": 1,
    }
    assert api(classroom.teacher).post(URL, cohort, format="json").status_code == 403
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_program.department)
    assert api(manager).post(URL, cohort, format="json").status_code == 201
    assert api(classroom.student).get(URL).data["count"] == 2  # course + cohort
    assert (
        api(make_user(Role.DEPARTMENT_MANAGER, department=ba_dept))
        .post(URL, cohort, format="json")
        .status_code
        == 403
    )
    assert Enrollment.objects.count() == 1


def test_bad_links_cancel_and_reminder(api, classroom, django_capture_on_commit_callbacks):
    bad = _body(classroom.offering, join_url="http://insecure.test/x")
    assert api(classroom.teacher).post(URL, bad, format="json").status_code == 400
    session = (
        api(classroom.teacher).post(URL, _body(classroom.offering, minutes=20), format="json").data
    )
    with django_capture_on_commit_callbacks(execute=True):
        assert remind_upcoming() == 1
        assert remind_upcoming() == 0
    assert api(classroom.ta).post(f"{URL}/{session['public_id']}/cancel").status_code == 200
    assert api(classroom.student).get(f"{URL}/{session['public_id']}/join").status_code == 400
