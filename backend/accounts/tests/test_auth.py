"""Login, cookies, refresh rotation, CSRF, lockout, password reset, activation."""

import pytest
from django.conf import settings
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from accounts.models import User
from accounts.rbac import Role
from conftest import PASSWORD, last_code

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/me"
ACCESS = settings.AUTH_COOKIE_ACCESS
REFRESH_COOKIE = settings.AUTH_COOKIE_REFRESH


@pytest.fixture
def staff(make_user, it_dept):
    return make_user(Role.DEPARTMENT_MANAGER, department=it_dept, email="dm@ecst.test")


def _login(client, email="dm@ecst.test", password=PASSWORD):
    return client.post(LOGIN, {"identifier": email, "password": password})


def test_login_sets_httponly_cookies(staff):
    client = APIClient()
    response = _login(client)
    assert response.status_code == 200
    assert response.data["email"] == "dm@ecst.test"
    assert response.data["capabilities"]["courses.manage"]["departments"] == [
        staff.role_assignments.get().department_id
    ]
    assert response.data["creatable_roles"] == []  # a manager creates no accounts
    access, refresh = response.cookies[ACCESS], response.cookies[REFRESH_COOKIE]
    assert access["httponly"] and refresh["httponly"]
    assert access["path"] == "/"
    assert refresh["path"] == "/api/v1/auth/"
    assert access["samesite"]
    # The cookie alone authenticates reads.
    assert client.get(ME).status_code == 200


def test_anonymous_is_401(db):
    response = APIClient().get(ME)
    assert response.status_code == 401
    assert response["Content-Type"].startswith("application/problem+json")


def test_cookie_writes_need_csrf(staff, it_dept):
    client = APIClient(enforce_csrf_checks=True)
    client.get("/api/public/csrf")
    token = client.cookies["csrftoken"].value
    assert _login(client).status_code == 200  # no session yet, so nothing to forge
    body = {"department": it_dept.pk, "code": "IT200", "name_ar": "هياكل البيانات"}
    assert client.post("/api/v1/courses", body).status_code == 403
    response = client.post("/api/v1/courses", body, HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 201, response.data


def test_refresh_rotates_and_old_token_dies(staff):
    client = APIClient()
    _login(client)
    old = client.cookies[REFRESH_COOKIE].value
    response = client.post(REFRESH)
    assert response.status_code == 200
    assert client.cookies[REFRESH_COOKIE].value != old
    # A second tab refreshing with the same token a moment later is not signed out…
    concurrent = APIClient()
    concurrent.cookies[REFRESH_COOKIE] = old
    assert concurrent.post(REFRESH).status_code == 200
    # …but once the grace period is over the old token is dead and cookies are cleared.
    cache.clear()
    replay = APIClient()
    replay.cookies[REFRESH_COOKIE] = old
    response = replay.post(REFRESH)
    assert response.status_code == 401
    assert response.cookies[REFRESH_COOKIE].value == ""


def test_logout_revokes_refresh(staff):
    client = APIClient()
    _login(client)
    token = client.cookies[REFRESH_COOKIE].value
    response = client.post(LOGOUT)
    assert response.status_code == 200
    assert response.cookies[ACCESS].value == ""
    replay = APIClient()
    replay.cookies[REFRESH_COOKIE] = token
    assert replay.post(REFRESH).status_code == 401


def test_deactivated_user_loses_access(staff):
    client = APIClient()
    _login(client)
    User.objects.filter(pk=staff.pk).update(is_active=False)
    assert client.get(ME).status_code == 401
    assert client.post(REFRESH).status_code == 401


def test_lockout_after_repeated_failures(staff):
    client = APIClient()
    for _ in range(settings.LOGIN_MAX_FAILURES):
        assert _login(client, password="wrong-password").status_code == 400
    response = _login(client)  # even the right password is refused now
    assert response.status_code == 429


def test_failures_do_not_reveal_which_part_was_wrong(staff):
    client = APIClient()
    unknown = _login(client, "nobody@ecst.test", "wrong-password")
    wrong = _login(client, "dm@ecst.test", "wrong-password")
    assert unknown.status_code == wrong.status_code == 400
    assert unknown.data["errors"] == wrong.data["errors"]


def test_password_reset_signs_out_everywhere(staff, django_capture_on_commit_callbacks):
    client = APIClient()
    _login(client)
    old_refresh = client.cookies[REFRESH_COOKIE].value
    with django_capture_on_commit_callbacks(execute=True):
        response = APIClient().post("/api/public/password/forgot", {"email": "dm@ecst.test"})
    assert response.status_code == 200
    code = last_code()
    new_password = "Another-Str0ng-2026"
    response = APIClient().post(
        "/api/public/password/reset",
        {"email": "dm@ecst.test", "code": code, "new_password": new_password},
    )
    assert response.status_code == 200, response.data
    replay = APIClient()
    replay.cookies[REFRESH_COOKIE] = old_refresh
    assert replay.post(REFRESH).status_code == 401
    assert _login(APIClient(), password=new_password).status_code == 200
    # The code is single-use.
    again = APIClient().post(
        "/api/public/password/reset",
        {"email": "dm@ecst.test", "code": code, "new_password": "Third-Str0ng-2026"},
    )
    assert again.status_code == 400


def test_forgot_password_is_uniform(db, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        response = APIClient().post("/api/public/password/forgot", {"email": "no@ecst.test"})
    assert response.status_code == 200
    assert mail.outbox == []


def test_staff_account_invitation_and_activation(
    make_user, api, it_dept, django_capture_on_commit_callbacks
):
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    with django_capture_on_commit_callbacks(execute=True):
        response = api(affairs).post(
            "/api/v1/users",
            {"email": "Teacher@ECST.test", "full_name_ar": "د. سلمى", "role": "teacher"},
        )
    assert response.status_code == 201, response.data
    teacher = User.objects.get(email="teacher@ecst.test")
    assert not teacher.has_usable_password()
    token = mail.outbox[-1].body.split("/activate/")[1].split()[0]
    activate = APIClient().post("/api/public/activate", {"token": token, "password": PASSWORD})
    assert activate.status_code == 200, activate.data
    assert _login(APIClient(), "teacher@ecst.test").status_code == 200
    reuse = APIClient().post("/api/public/activate", {"token": token, "password": PASSWORD})
    assert reuse.status_code == 400


def test_academic_affairs_cannot_create_admins(make_user, api):
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    response = api(affairs).post(
        "/api/v1/users", {"email": "x@ecst.test", "full_name_ar": "س", "role": "system_admin"}
    )
    assert response.status_code == 403
    assert not User.objects.filter(email="x@ecst.test").exists()
    # The portal offers only the roles the server will accept.
    me = api(affairs).get("/api/v1/me").data
    assert me["creatable_roles"] == ["ta", "teacher"]
    assert me["grantable_roles"] == [
        "department_manager",
        "department_supervisor",
        "ta",
        "teacher",
    ]


def test_a_non_object_body_is_a_bad_request_not_a_crash(db):
    """Found by the contract test: the per-email throttle read .get() on a JSON list."""
    for path in ("/api/public/password/forgot", "/api/public/registration/start"):
        response = APIClient().post(path, [None, None], format="json")
        assert response.status_code == 400, (path, response.status_code)
