"""A department's page in the portal shows who leads it (review 2026-11-12)."""

from accounts.rbac import Role


def test_a_department_names_its_head_and_supervisor(api, make_user, it_dept, ba_dept):
    head = make_user(Role.DEPARTMENT_MANAGER, department=it_dept, full_name_ar="د. رئيس")
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept, full_name_ar="أ. مشرف")
    make_user(Role.DEPARTMENT_MANAGER, department=ba_dept, full_name_ar="رئيس قسم آخر")
    url = f"/api/v1/departments/{it_dept.pk}/leaders"
    for reader in (make_user(Role.ACADEMIC_AFFAIRS), make_user(Role.SYSTEM_SUPERVISOR), head):
        rows = api(reader).get(url).data
        assert [(r["role"], r["user"]["full_name_ar"]) for r in rows] == [
            ("department_manager", "د. رئيس"),
            ("department_supervisor", "أ. مشرف"),
        ]
        assert rows[0]["role_label"] == "مدير القسم"
    # The assignment's id revokes it: the page removes a head through /role-assignments.
    admin = api(make_user(Role.SYSTEM_ADMIN))
    first = api(head).get(url).data[1]["id"]
    assert admin.delete(f"/api/v1/role-assignments/{first}").status_code == 204
    assert not supervisor.role_assignments.exists()
    # Another department's head does not see this one.
    other = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(other).get(url).status_code == 404
