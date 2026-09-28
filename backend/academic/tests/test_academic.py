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
