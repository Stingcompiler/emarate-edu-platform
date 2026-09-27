"""Student self-registration: record match → OTP → password → (approval)."""

import pytest
from django.core import mail

from accounts.models import RegistrationRequest, User
from accounts.rbac import Role
from conftest import PASSWORD, last_code
from organization.models import SystemSettings

START = "/api/public/registration/start"
VERIFY = "/api/public/registration/verify"
COMPLETE = "/api/public/registration/complete"
LOGIN = "/api/v1/auth/login"


@pytest.fixture
def student(make_student, it_program):
    return make_student(it_program, "26-IT-0001", name="أحمد محمد علي", email="ahmed@college.test")


def _start(api, capture, number, name, email):
    with capture(execute=True):
        response = api().post(
            START, {"university_number": number, "full_name": name, "email": email}
        )
    assert response.status_code == 200
    return response.data["request_id"]


def _register(api, capture, email, name="احمد محمد علي"):
    request_id = _start(api, capture, "26-IT-0001", name, email)
    assert api().post(VERIFY, {"request_id": request_id, "code": last_code()}).status_code == 200
    with capture(execute=True):
        response = api().post(COMPLETE, {"request_id": request_id, "password": PASSWORD})
    assert response.status_code == 201, response.data
    return str(request_id), response.data["status"]


def test_unknown_details_get_the_same_answer_and_no_email(
    api, django_capture_on_commit_callbacks, student
):
    with django_capture_on_commit_callbacks(execute=True):
        real = api().post(
            START,
            {"university_number": "26-IT-0001", "full_name": "أحمد محمد علي", "email": "a@x.test"},
        )
        fake = api().post(
            START, {"university_number": "99-XX-0000", "full_name": "لا أحد", "email": "b@x.test"}
        )
        wrong_name = api().post(
            START,
            {"university_number": "26-IT-0001", "full_name": "سارة عمر", "email": "c@x.test"},
        )
    assert real.status_code == fake.status_code == wrong_name.status_code == 200
    assert real.data["detail"] == fake.data["detail"] == wrong_name.data["detail"]
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["a@x.test"]


def test_fake_request_can_never_be_verified(api, django_capture_on_commit_callbacks, db):
    request_id = _start(api, django_capture_on_commit_callbacks, "99-XX-0000", "لا أحد", "b@x.test")
    response = api().post(VERIFY, {"request_id": request_id, "code": "123456"})
    assert response.status_code == 400


def test_official_email_activates_immediately(api, django_capture_on_commit_callbacks, student):
    _, status = _register(api, django_capture_on_commit_callbacks, "Ahmed@College.test")
    assert status == "active"
    user = User.objects.get(email="ahmed@college.test")
    assert user.is_active
    assert user.role_assignments.filter(role=Role.STUDENT).exists()
    student.refresh_from_db()
    assert student.user == user
    # Signs in with the university number too.
    response = api().post(LOGIN, {"identifier": "26-it-0001", "password": PASSWORD})
    assert response.status_code == 200
    assert response.data["student"]["university_number"] == "26-IT-0001"


def test_other_email_waits_for_the_department(
    api, django_capture_on_commit_callbacks, student, make_user, it_dept, ba_dept
):
    request_id, status = _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    assert status == "pending_approval"
    pending = api().post(LOGIN, {"identifier": "me@gmail.test", "password": PASSWORD})
    assert pending.status_code == 403
    assert pending.data["code"] == "pending_approval"

    other_manager = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    url = f"/api/v1/registration-requests/{request_id}"
    assert api(other_manager).get(url).status_code == 404

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    listing = api(manager).get("/api/v1/registration-requests")
    assert [r["public_id"] for r in listing.data["results"]] == [request_id]
    with django_capture_on_commit_callbacks(execute=True):
        decided = api(manager).post(f"{url}/decide", {"approve": True})
    assert decided.status_code == 200
    assert "اعتُمد" in mail.outbox[-1].body
    assert (
        api().post(LOGIN, {"identifier": "me@gmail.test", "password": PASSWORD}).status_code == 200
    )

    again = api(manager).post(f"{url}/decide", {"approve": True})
    assert again.status_code == 409


def test_rejection_frees_the_record(api, django_capture_on_commit_callbacks, student, make_user):
    request_id, _ = _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    head = make_user(Role.HEAD_REGISTRAR)
    response = api(head).post(
        f"/api/v1/registration-requests/{request_id}/decide",
        {"approve": False, "reason": "الاسم لا يطابق"},
    )
    assert response.status_code == 200
    assert not User.objects.filter(email="me@gmail.test").exists()
    student.refresh_from_db()
    assert student.user is None
    # The student can register again.
    _, status = _register(api, django_capture_on_commit_callbacks, "ahmed@college.test")
    assert status == "active"


def test_approval_switch_off_activates_everyone(api, django_capture_on_commit_callbacks, student):
    config = SystemSettings.load()
    config.student_registration_requires_approval = False
    config.save()
    _, status = _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    assert status == "active"


def test_wrong_codes_lock_the_request(api, django_capture_on_commit_callbacks, student):
    request_id = _start(
        api, django_capture_on_commit_callbacks, "26-IT-0001", "أحمد محمد علي", "a@x.test"
    )
    real = last_code()
    wrong = "000000" if real != "000000" else "111111"
    statuses = [
        api().post(VERIFY, {"request_id": request_id, "code": wrong}).status_code
        for _ in range(SystemSettings.load().otp_max_attempts)
    ]
    assert statuses[:-1] == [400] * (len(statuses) - 1)
    assert statuses[-1] == 429
    assert api().post(VERIFY, {"request_id": request_id, "code": real}).status_code == 429


def test_cannot_complete_before_verifying(api, django_capture_on_commit_callbacks, student):
    request_id = _start(
        api, django_capture_on_commit_callbacks, "26-IT-0001", "أحمد محمد علي", "a@x.test"
    )
    response = api().post(COMPLETE, {"request_id": request_id, "password": PASSWORD})
    assert response.status_code == 400
    assert RegistrationRequest.objects.get(public_id=request_id).status == "otp_pending"


def test_registered_student_cannot_register_twice(api, django_capture_on_commit_callbacks, student):
    _register(api, django_capture_on_commit_callbacks, "ahmed@college.test")
    mail.outbox.clear()
    _start(api, django_capture_on_commit_callbacks, "26-IT-0001", "أحمد محمد علي", "new@x.test")
    assert mail.outbox == []
