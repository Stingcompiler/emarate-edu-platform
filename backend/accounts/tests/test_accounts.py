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
