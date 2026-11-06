"""Escalation invariants and explicitly labelled out-of-matrix observations."""

import pytest

from accounts.models import RegistrationRequest, RoleAssignment, User
from accounts.rbac import Role
from core.tests.test_permission_matrix import world as fixture_world
from results.models import AcademicResult, ResultCorrection
from students.models import StudentRecord

from .matrix import MATRIX, ROLES, UNCOVERED

world = fixture_world


def snapshot(models):
    return [list(model.objects.order_by("pk").values()) for model in models]


@pytest.mark.parametrize("role", [role for role in Role if role != Role.SYSTEM_ADMIN])
@pytest.mark.parametrize("target", ["self", "other", "new"])
def test_cannot_assign_system_admin(role, target, api, users, make_user):
    actor = users[role]
    other = make_user(Role.TEACHER)
    before = snapshot([User, RoleAssignment])
    if target == "new":
        url = "/api/v1/users"
        data = {
            "role": "system_admin",
            "email": "audit-escalation@example.test",
            "full_name_ar": "اختبار",
        }
    else:
        url = "/api/v1/role-assignments"
        data = {
            "role": "system_admin",
            "user": str((actor if target == "self" else other).public_id),
        }
    response = api(actor).post(url, data, format="json")
    assert response.status_code in (403, 404), response.data
    assert snapshot([User, RoleAssignment]) == before


REJECT_CASES = [
    (code, side) for code in ROLES if code not in UNCOVERED for side in ["own", "other"]
]


@pytest.mark.parametrize(
    "code,side", REJECT_CASES, ids=[f"{code}-{side}" for code, side in REJECT_CASES]
)
def test_observed_registration_rejection(code, side, api, make_user, it_dept, ba_dept, world):
    # Characterizes the reject branch using the approval gate. The matrix does not
    # explicitly specify rejection/deletion, so this is not a separate policy grant.
    actor = make_user(ROLES[code], department=it_dept if side == "own" else ba_dept)
    request = RegistrationRequest.objects.get(public_id=world["registration"])
    student = request.student_record
    account_id = student.user_id
    models = [RegistrationRequest, StudentRecord, User, RoleAssignment]
    before = snapshot(models)
    response = api(actor).post(
        f"/api/v1/registration-requests/{request.public_id}/decide",
        {"approve": False, "reason": "Audit rejection"},
        format="json",
    )
    expected = MATRIX["enrollment.approve"]["values"][code]
    allowed = expected == "all" or (expected == "dept" and side == "own")
    if allowed:
        assert response.status_code == 200, response.data
        request.refresh_from_db()
        student.refresh_from_db()
        assert request.status == "rejected"
        assert request.decided_by_id == actor.pk
        assert student.user_id is None
        assert not User.objects.filter(pk=account_id).exists()
    else:
        assert response.status_code in (403, 404), response.data
        assert snapshot(models) == before


@pytest.mark.parametrize("role", [Role.SYSTEM_ADMIN, Role.SYSTEM_SUPERVISOR])
def test_no_one_approves_their_own_result_correction(role, api, users, world):
    """Owner, 2026-11-06 (roles review): the one who asked for a correction does not decide it."""
    result = AcademicResult.objects.get(pk=world["result"])
    ResultCorrection.objects.filter(result=result).delete()
    before = result.score
    actor = users[role]
    client = api(actor)
    created = client.post(
        f"/api/v1/results/{result.pk}/corrections",
        {"score": "85", "reason": "Audit self approval"},
        format="json",
    )
    assert created.status_code == 201
    correction = ResultCorrection.objects.get(result=result)
    decided = client.post(
        f"/api/v1/result-corrections/{correction.public_id}/decide",
        {"approve": True},
        format="json",
    )
    assert decided.status_code == 403
    correction.refresh_from_db()
    result.refresh_from_db()
    assert correction.status == ResultCorrection.Status.PENDING and correction.decided_by_id is None
    assert result.score == before
