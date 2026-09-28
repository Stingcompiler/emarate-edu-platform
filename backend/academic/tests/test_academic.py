def test_teacher_directory(api, users, make_user):
    from accounts.rbac import Role

    make_user(Role.TEACHER, full_name_ar="د. سامية الحاج", email="samia@x.test")
    make_user(Role.STUDENT, full_name_ar="سامية طالبة", email="samia.s@x.test")
    found = api(users[Role.DEPARTMENT_MANAGER]).get("/api/v1/teachers-directory?search=سامية").data
    assert [p["full_name_ar"] for p in found] == ["د. سامية الحاج"]
    assert api(users[Role.DEPARTMENT_MANAGER]).get("/api/v1/teachers-directory?search=س").data == []
    assert (
        api(users[Role.TEACHER]).get("/api/v1/teachers-directory?search=سامية").status_code == 403
    )
