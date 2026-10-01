from accounts import rbac
from accounts.rbac import Role


def test_the_roles_matrix_is_read_from_rbac(api, make_user):
    """«الأدوار والصلاحيات» (review 2026-09-29 PR 7): what the code enforces, read-only."""
    admin = make_user(Role.SYSTEM_ADMIN)
    make_user(Role.TEACHER)
    data = api(admin).get("/api/v1/roles").data
    roles = {r["key"]: r for r in data["roles"]}
    assert set(roles) == {r.value for r in Role}
    assert roles["teacher"]["users"] >= 1 and roles["system_admin"]["users"] >= 1
    assert roles["registrar"]["department_scoped"] is True
    assert roles["teacher"]["department_scoped"] is False
    caps = {c["key"]: set(c["roles"]) for c in data["capabilities"]}
    assert caps.keys() == rbac.CAPABILITIES.keys()
    assert caps["structure.manage"] == {"system_admin"}
    assert api(admin).post("/api/v1/roles", {}).status_code == 405
