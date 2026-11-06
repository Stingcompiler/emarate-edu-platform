"""Security invariants independent of the business permission matrix.

DRF can ignore unrecognised PATCH keys. Check persisted authority even on 200.
"""

import pytest

from accounts.models import RoleAssignment, User
from accounts.rbac import DEPARTMENT_SCOPED_ROLES, Role


def authority():
    flags = User.objects.order_by("pk").values_list("pk", "is_staff", "is_superuser")
    assignments = RoleAssignment.objects.order_by("pk").values_list(
        "user_id", "role", "department_id"
    )
    return list(flags), list(assignments)


@pytest.mark.parametrize("role", Role)
@pytest.mark.parametrize("resource", ["me", "me/public-profile", "self-detail", "other-detail"])
def test_profile_patch_cannot_change_authority(role, resource, users, api, ba_dept):
    actor = users[role]
    path = resource
    if resource.endswith("-detail"):
        other = users[Role.TEACHER if role != Role.TEACHER else Role.TA]
        target = actor if resource == "self-detail" else other
        path = f"users/{target.public_id}"
    before = authority()
    response = api(actor).patch(
        f"/api/v1/{path}",
        {
            "role": "system_admin",
            "roles": [{"role": "system_admin"}],
            "department": ba_dept.pk,
            "is_superuser": True,
            "is_staff": True,
        },
        format="json",
    )
    assert response.status_code in (200, 400, 403, 404)
    assert authority() == before


@pytest.mark.parametrize("role", sorted(DEPARTMENT_SCOPED_ROLES))
def test_other_department_registration_detail_hidden_both_directions(
    role, api, make_user, make_student, it_dept, ba_dept, it_program, ba_program
):
    from accounts.models import RegistrationRequest

    for own, foreign in [(it_dept, ba_program), (ba_dept, it_program)]:
        actor = make_user(role, department=own)
        student = make_student(foreign, f"audit-{foreign.pk}")
        pending = RegistrationRequest.objects.create(
            student_record=student,
            email=actor.email,
            status=RegistrationRequest.Status.PENDING_APPROVAL,
        )
        url = f"/api/v1/registration-requests/{pending.public_id}"
        assert api(actor).get(url).status_code in (403, 404)
        assert api(actor).post(url + "/decide", {"approve": True}, format="json").status_code in (
            403,
            404,
        )
        pending.refresh_from_db()
        assert pending.status == RegistrationRequest.Status.PENDING_APPROVAL
        assert pending.decided_by_id is None


@pytest.mark.parametrize("role", Role)
def test_other_members_link_cannot_be_changed_or_removed(role, api, users, make_user):
    from accounts.models import StaffLink

    owner = make_user(Role.TEACHER)
    link = StaffLink.objects.create(user=owner, label="Portal", url="https://example.org/")
    client = api(users[role])
    url = f"/api/v1/me/links/{link.pk}"
    assert client.patch(url, {"label": "changed"}, format="json").status_code in (403, 404)
    assert client.delete(url).status_code in (403, 404)
    link.refresh_from_db()
    assert link.user_id == owner.pk
    assert link.label == "Portal"


@pytest.mark.parametrize("role", Role)
def test_account_reads_do_not_disclose_password_material(role, api, users):
    actor = users[role]
    client = api(actor)
    for path in ["me", "users", f"users/{actor.public_id}"]:
        response = client.get(f"/api/v1/{path}")
        if response.status_code in (403, 404):
            assert path != "me"
            continue
        assert response.status_code == 200
        assert actor.password.encode() not in response.content
        assert b'"password":' not in response.content
