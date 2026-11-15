"""Throwaway probes, batch C: programme deleted / moved; programme-only user basics."""

from academic.models import DepartmentMembership
from accounts.models import RoleAssignment
from accounts.rbac import Role
from audit.models import AuditLog
from organization.models import Program


def test_delete_programme_with_head_links_and_log(api, make_user, it_dept, ba_dept):
    admin = make_user(Role.SYSTEM_ADMIN)
    p = Program.objects.create(
        department=it_dept, code="TMP", name_ar="مؤقت", degree="diploma",
        levels_count=2, duration_terms=4,
    )
    make_user(Role.PROGRAM_MANAGER, program=p)
    t = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(department=it_dept, program=p, user=t, kind="teacher")
    client = api(admin)
    client.raise_request_exception = False
    assert client.patch(f"/api/v1/programs/{p.pk}", {"name_ar": "مؤقت ٢"}, format="json").status_code == 200
    moved = client.patch(f"/api/v1/programs/{p.pk}", {"department": ba_dept.pk}, format="json")
    assert moved.status_code == 200, moved.data
    assert DepartmentMembership.objects.get(user=t).department_id == ba_dept.pk
    r = client.delete(f"/api/v1/programs/{p.pk}")
    assert r.status_code == 204, (r.status_code, getattr(r, "data", None))
    assert not RoleAssignment.objects.filter(program_id=p.pk).exists()
    assert AuditLog.objects.filter(action="program.links_end").exists()


def test_programme_only_user_me_and_departments(api, make_user, it_program):
    ph = make_user(Role.PROGRAM_MANAGER, program=it_program)
    me = api(ph).get("/api/v1/me")
    assert me.status_code == 200
    deps = api(ph).get("/api/v1/departments").data
    rows = deps.get("results", deps)
    assert [d["id"] for d in rows] == [it_program.department_id]
