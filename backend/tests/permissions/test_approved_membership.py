"""Approved add/remove operations, including indirect instructor removal."""

import pytest

from academic.models import DepartmentMembership, OfferingInstructor
from accounts.rbac import Role

from .matrix import MATRIX, ROLES, UNCOVERED

KEYS = ["dept.members.add", "dept.members.remove", "courses.unassign"]
CASES = [
    (key, code, side)
    for key in KEYS
    for code in ROLES
    if code not in UNCOVERED
    for side in ("own", "other")
]


@pytest.mark.parametrize("key,code,side", CASES, ids=[f"{k}-{c}-{s}" for k, c, s in CASES])
def test_membership_policy(
    key, code, side, api, make_user, it_dept, ba_dept, it_offering, ba_offering, record_property
):
    for own, foreign in [(it_dept, ba_dept), (ba_dept, it_dept)]:
        target = own if side == "own" else foreign
        offering = it_offering if target == it_dept else ba_offering
        actor = make_user(ROLES[code], department=own)
        teacher = make_user(Role.TEACHER)
        member = None
        instructor = None
        if key != "dept.members.add":
            member = DepartmentMembership.objects.create(
                department=target, user=teacher, kind="teacher", added_by=actor
            )
            instructor = OfferingInstructor.objects.create(
                offering=offering, user=teacher, role="teacher"
            )
        before = (
            list(DepartmentMembership.objects.values()),
            list(OfferingInstructor.objects.values()),
        )
        client = api(actor)
        if key == "dept.members.add":
            response = client.post(
                f"/api/v1/departments/{target.pk}/members",
                {"user": str(teacher.public_id), "kind": "teacher"},
                format="json",
            )
        elif key == "dept.members.remove":
            response = client.delete(f"/api/v1/departments/{target.pk}/members/{member.pk}")
        else:
            response = client.delete(f"/api/v1/offerings/{offering.pk}/instructors/{instructor.pk}")
        expected = MATRIX[key]["values"][code]
        allowed = expected == "all" or (expected == "dept" and side == "own")
        record_property(f"{own.code}_status", response.status_code)
        if allowed:
            assert response.status_code == (201 if key == "dept.members.add" else 204), (
                response.data
            )
            if key == "dept.members.add":
                assert DepartmentMembership.objects.filter(department=target, user=teacher).exists()
            else:
                assert not OfferingInstructor.objects.filter(pk=instructor.pk).exists()
                assert DepartmentMembership.objects.filter(pk=member.pk).exists() == (
                    key == "courses.unassign"
                )
        else:
            assert before == (
                list(DepartmentMembership.objects.values()),
                list(OfferingInstructor.objects.values()),
            )
            assert response.status_code in (403, 404), response.data
