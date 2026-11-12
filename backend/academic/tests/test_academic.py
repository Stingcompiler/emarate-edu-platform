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


def test_set_current_term(api, users, term):
    from datetime import date

    from academic.models import AcademicYear, Term
    from accounts.rbac import Role

    year = AcademicYear.objects.create(
        name="2027/2028", starts_on=date(2027, 9, 1), ends_on=date(2028, 7, 31)
    )
    later = Term.objects.create(
        academic_year=year,
        order=1,
        name_ar="خريف 2027",
        starts_on=date(2027, 9, 1),
        ends_on=date(2028, 1, 31),
    )
    url = f"/api/v1/terms/{later.pk}/set-current"
    assert api(users[Role.HEAD_REGISTRAR]).post(url).status_code == 403
    assert api(users[Role.SYSTEM_ADMIN]).post(url).status_code == 200
    assert list(Term.objects.filter(is_current=True).values_list("pk", flat=True)) == [later.pk]
    assert AcademicYear.objects.get(is_current=True) == year


def test_academic_affairs_can_join_a_department_once_they_hold_the_teacher_role(
    api, make_user, it_dept, it_offering
):
    """The department finds academic affairs in its directory and is told who grants the
    teacher role; with it, they join and teach, and keep their own role (review 2026-11-12)."""
    from accounts.rbac import Role

    secretary = make_user(Role.ACADEMIC_AFFAIRS, full_name_ar="أمين الشؤون العلمية")
    manager = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    found = manager.get("/api/v1/teachers-directory?search=أمين").data
    assert [(p["full_name_ar"], p["kinds"]) for p in found] == [("أمين الشؤون العلمية", [])]
    refused = manager.post(
        f"/api/v1/departments/{it_dept.pk}/members",
        {"user": str(secretary.public_id), "kind": "teacher"},
        format="json",
    )
    assert refused.status_code == 400
    message = refused.data["errors"]["user"][0]
    assert "«أستاذ»" in message and "teacher" not in message
    # Nobody grants a role to themselves; the system admin grants it.
    grant = {"user": str(secretary.public_id), "role": Role.TEACHER}
    assert api(secretary).post("/api/v1/role-assignments", grant, format="json").status_code == 403
    admin = api(make_user(Role.SYSTEM_ADMIN))
    assert admin.post("/api/v1/role-assignments", grant, format="json").status_code == 201
    assert manager.get("/api/v1/teachers-directory?search=أمين").data[0]["kinds"] == ["teacher"]
    joined = manager.post(
        f"/api/v1/departments/{it_dept.pk}/members",
        {"user": str(secretary.public_id), "kind": "teacher"},
        format="json",
    )
    assert joined.status_code == 201, joined.data
    assigned = manager.post(
        f"/api/v1/offerings/{it_offering.pk}/instructors",
        {"user": str(secretary.public_id), "role": "teacher"},
        format="json",
    )
    assert assigned.status_code == 201, assigned.data
    me = api(secretary).get("/api/v1/me").data
    assert {r["role"] for r in me["roles"]} == {Role.ACADEMIC_AFFAIRS, Role.TEACHER}
    assert "results.approve" in me["capabilities"]  # still academic affairs
