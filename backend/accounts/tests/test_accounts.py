def test_set_active(api, users, make_user):
    from accounts.rbac import Role

    teacher = make_user(Role.TEACHER, password="Pass-1234-word")
    url = f"/api/v1/users/{teacher.public_id}/set-active"
    assert (
        api(users[Role.ACADEMIC_AFFAIRS]).post(url, {"is_active": False}, format="json").status_code
        == 200
    )
    teacher.refresh_from_db()
    assert teacher.is_active is False
    registrar = users[Role.REGISTRAR]
    other = f"/api/v1/users/{registrar.public_id}/set-active"
    assert (
        api(users[Role.ACADEMIC_AFFAIRS])
        .post(other, {"is_active": False}, format="json")
        .status_code
        == 403
    )
    admin = users[Role.SYSTEM_ADMIN]
    assert api(admin).post(other, {"is_active": False}, format="json").status_code == 200
    mine = f"/api/v1/users/{admin.public_id}/set-active"
    assert api(admin).post(mine, {"is_active": False}, format="json").status_code == 403
    assert api(users[Role.HR]).post(url, {"is_active": True}, format="json").status_code == 403


def test_create_system_admin_command(db, api):
    from io import StringIO

    import pytest
    from django.core.management import CommandError, call_command

    from accounts import rbac
    from accounts.models import User

    out = StringIO()
    call_command("create_system_admin", email="Root@ECST.test", name="مدير", stdout=out)
    user = User.objects.get(email="root@ecst.test")
    assert rbac.has_role(user, rbac.Role.SYSTEM_ADMIN) and not user.has_usable_password()
    token = out.getvalue().rsplit("/activate/", 1)[1].strip()
    assert (
        api()
        .post("/api/public/activate", {"token": token, "password": "Strong-pass-9"}, format="json")
        .status_code
        == 200
    )
    with pytest.raises(CommandError):
        call_command("create_system_admin", email="root@ecst.test", name="x", stdout=StringIO())
