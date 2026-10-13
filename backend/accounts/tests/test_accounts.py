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


def test_role_counts_follow_what_the_caller_may_grant(api, users):
    from accounts.rbac import Role

    everything = api(users[Role.SYSTEM_ADMIN]).get("/api/v1/role-assignments/counts").data
    assert everything["counts"][Role.TEACHER] == 1  # one user per role in the fixture
    assert set(everything["counts"]) == {r.value for r in Role}
    head = api(users[Role.HEAD_REGISTRAR]).get("/api/v1/role-assignments/counts").data
    assert head["counts"] == {Role.REGISTRAR: 1}


def test_the_admin_deletes_an_unused_account(api, users, make_user):
    """Owner request 2026-10-13: the system admin deletes an account nothing points at (made by
    mistake); one with a history is refused, because its records keep their author."""
    from accounts.models import User
    from accounts.rbac import Role
    from audit.models import AuditLog
    from audit.services import RequestMeta, record

    admin = users[Role.SYSTEM_ADMIN]
    client = api(admin)

    unused = make_user(Role.TEACHER)
    url = f"/api/v1/users/{unused.public_id}"
    # Only a system admin deletes (academic affairs may create and disable teachers, not delete).
    assert api(users[Role.ACADEMIC_AFFAIRS]).delete(url).status_code == 403
    assert client.delete(url).status_code == 204
    assert not User.objects.filter(pk=unused.pk).exists()
    entry = AuditLog.objects.get(action="account.delete")
    assert entry.actor_id == admin.pk and entry.old["email"] == unused.email

    # An account with a history (here: it acted in the audit log) is not deleted; disable it.
    worked = make_user(Role.HR)
    record(RequestMeta(actor=worked), "something.done", worked)
    refused = client.delete(f"/api/v1/users/{worked.public_id}")
    assert refused.status_code == 409 and refused.data["code"] == "has_history"
    assert User.objects.filter(pk=worked.pk).exists()
    assert not AuditLog.objects.filter(action="account.delete", target_id=str(worked.pk)).exists()

    # Never one's own account. A second admin can delete a fresh admin, but not the first one,
    # who has a history by now (the deletion above is in the log under their name).
    assert client.delete(f"/api/v1/users/{admin.public_id}").status_code == 403
    second = make_user(Role.SYSTEM_ADMIN)
    spare = make_user(Role.SYSTEM_ADMIN)
    assert api(second).delete(f"/api/v1/users/{spare.public_id}").status_code == 204
    assert api(second).delete(f"/api/v1/users/{admin.public_id}").status_code == 409
