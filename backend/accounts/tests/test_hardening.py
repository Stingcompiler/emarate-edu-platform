"""Sign-in hardening from the 2026-09-29 review (docs/qa/full-review-2026-09-29.md §2.1)."""

import pytest
from django.conf import settings
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from academic.models import Enrollment
from accounts import otp
from accounts.models import OneTimeCode, User
from accounts.rbac import Role
from accounts.throttles import LoginThrottle, OTPTargetThrottle
from conftest import PASSWORD
from content.sanitize import clean_blocks

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"


def _login(client, identifier, password=PASSWORD, ip="10.0.0.1"):
    return client.post(LOGIN, {"identifier": identifier, "password": password}, REMOTE_ADDR=ip)


def test_a_signed_in_user_is_throttled_on_login_too(make_user, monkeypatch):
    """S2: the per-IP login limit applies to callers with a session as well."""
    monkeypatch.setattr(LoginThrottle, "rate", "3/minute", raising=False)
    student = make_user(Role.STUDENT, email="s@ecst.test")
    make_user(Role.TEACHER, email="victim@ecst.test")
    client = APIClient()
    client.force_authenticate(student)
    codes = [_login(client, "victim@ecst.test", "guess").status_code for _ in range(4)]
    assert codes == [400, 400, 400, 429]


def test_otp_attempts_count_even_from_stale_copies(db):
    """S3: parallel guesses (each holding the row as it was) can't exceed the limit."""
    row, code = otp.issue("reset", "a@ecst.test")
    stale = [OneTimeCode.objects.get(pk=row.pk) for _ in range(8)]  # all read attempts=0
    results = [otp.check(copy, "000000" if code != "000000" else "111111") for copy in stale]
    assert results.count(otp.OTPResult.INVALID) == 4
    assert results[4:] == [otp.OTPResult.TOO_MANY_ATTEMPTS] * 4
    assert OneTimeCode.objects.get(pk=row.pk).attempts == 5
    # Even the right code is refused once the attempts are spent.
    assert otp.check(OneTimeCode.objects.get(pk=row.pk), code) == otp.OTPResult.TOO_MANY_ATTEMPTS


def test_a_code_is_consumed_once(db):
    row, code = otp.issue("reset", "b@ecst.test")
    first, second = OneTimeCode.objects.get(pk=row.pk), OneTimeCode.objects.get(pk=row.pk)
    assert otp.check(first, code) == otp.OTPResult.OK
    assert otp.check(second, code) == otp.OTPResult.INVALID


def test_visitor_codes_are_limited_per_email_across_ips(db, monkeypatch):
    """S4: many IPs can't request endless codes for one applicant."""
    monkeypatch.setattr(OTPTargetThrottle, "rate", "5/hour", raising=False)
    statuses = [
        APIClient()
        .post("/api/public/visitor/otp", {"email": "applicant@x.test"}, REMOTE_ADDR=f"10.1.0.{i}")
        .status_code
        for i in range(7)
    ]
    assert statuses == [200] * 5 + [429] * 2


def test_a_disabled_account_cannot_use_its_invitation(
    make_user, api, django_capture_on_commit_callbacks
):
    """S5: disabling voids the unused link; re-enabling sends a new one."""
    admin = make_user(Role.SYSTEM_ADMIN)
    with django_capture_on_commit_callbacks(execute=True):
        created = api(admin).post(
            "/api/v1/users", {"email": "t@ecst.test", "full_name_ar": "د. سلمى", "role": "teacher"}
        )
    teacher = User.objects.get(email="t@ecst.test")
    token = mail.outbox[-1].body.split("/activate/")[1].split()[0]
    off = api(admin).post(
        f"/api/v1/users/{created.data['public_id']}/set-active", {"is_active": False}
    )
    assert off.status_code == 200, off.data
    reuse = APIClient().post("/api/public/activate", {"token": token, "password": PASSWORD})
    assert reuse.status_code == 400
    teacher.refresh_from_db()
    assert not teacher.is_active
    with django_capture_on_commit_callbacks(execute=True):
        on = api(admin).post(
            f"/api/v1/users/{created.data['public_id']}/set-active", {"is_active": True}
        )
    assert on.status_code == 200
    fresh = mail.outbox[-1].body.split("/activate/")[1].split()[0]
    assert fresh != token
    assert (
        APIClient().post("/api/public/activate", {"token": fresh, "password": PASSWORD}).status_code
        == 200
    )


def test_lockout_is_per_account_not_per_identifier(make_user, make_student, it_program):
    """S9: email and university number share one failure budget."""
    user = make_user(Role.STUDENT, email="st@ecst.test")
    make_student(it_program, "26-IT-0500", user=user)
    client = APIClient()
    half = settings.LOGIN_MAX_FAILURES // 2
    for i in range(settings.LOGIN_MAX_FAILURES):
        identifier = "st@ecst.test" if i < half else "26-IT-0500"
        _login(client, identifier, "wrong", ip=f"10.2.0.{i}")
    response = _login(client, "26-IT-0500", ip="10.2.1.1")
    assert response.status_code == 429


def test_logout_ends_the_refresh_grace(make_user):
    """S10: a token rotated just before signing out is not accepted again."""
    make_user(Role.TEACHER, email="g@ecst.test")
    client = APIClient()
    assert _login(client, "g@ecst.test").status_code == 200
    old = client.cookies[settings.AUTH_COOKIE_REFRESH].value
    assert client.post(REFRESH).status_code == 200  # rotates `old`
    assert client.post(LOGOUT).status_code == 200
    replay = APIClient()
    replay.cookies[settings.AUTH_COOKIE_REFRESH] = old
    assert replay.post(REFRESH).status_code == 401


def test_push_endpoints_must_be_browser_push_services(make_user, api):
    """S11: the server posts to this address; internal hosts are refused."""
    user = make_user(Role.STUDENT)
    keys = {"p256dh": "k" * 20, "auth": "a" * 10}
    bad = api(user).post(
        "/api/v1/push/subscriptions",
        {"endpoint": "https://10.0.0.5:8443/hook", "keys": keys},
        format="json",
    )
    assert bad.status_code == 400
    good = api(user).post(
        "/api/v1/push/subscriptions",
        {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": keys},
        format="json",
    )
    assert good.status_code == 201


def test_no_self_grants_and_no_staff_roles_on_students(make_user, api, it_dept):
    """S12: academic affairs can't make itself a manager, nor a student a staff member."""
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    student = make_user(Role.STUDENT)
    for target in (affairs, student):
        response = api(affairs).post(
            "/api/v1/role-assignments",
            {"user": str(target.public_id), "role": "department_manager", "department": it_dept.pk},
        )
        assert response.status_code in (400, 403), response.data
    assert not affairs.role_assignments.filter(role="department_manager").exists()
    assert not student.role_assignments.filter(role="department_manager").exists()


def test_a_department_enrolls_only_its_own_students(
    make_user, make_student, api, it_dept, it_offering, ba_program
):
    """S12: another department's student goes through the head registrar."""
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    head = make_user(Role.HEAD_REGISTRAR)
    other = make_student(ba_program, "26-BA-0900")
    body = {"offering": it_offering.pk, "student_record": str(other.public_id)}
    assert api(manager).post("/api/v1/enrollments", body).status_code == 403
    assert api(head).post("/api/v1/enrollments", body).status_code == 201
    assert Enrollment.objects.filter(student_record=other).count() == 1


@pytest.mark.parametrize(
    ("url", "kept"),
    [
        ("https://ecst.edu.sd/x", True),
        ("/ar/admissions/", True),
        ("//evil.example/x", False),
        ("/\\evil.example/x", False),
        ("javascript:alert(1)", False),
    ],
)
def test_page_links_stay_on_safe_targets(url, kept):
    blocks = clean_blocks([{"type": "cta", "text": "قدّم", "url": url}])
    assert ("url" in blocks[0]) is kept


def test_cache_is_clean_between_tests():
    assert cache.get("auth:cut:1") is None
