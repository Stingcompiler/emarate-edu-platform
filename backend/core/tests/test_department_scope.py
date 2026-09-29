"""A department role sees nothing of other departments (owner 2026-09-29).

The department manager/supervisor (and the registrar) read only their departments'
structure and intakes; college-wide roles still read everything. In their own
department the manager opens every course space with full control.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from academic.models import OfferingInstructor
from accounts.rbac import Role
from admissions.models import AdmissionCycle, ProgramIntake

DEPARTMENT_ROLES = [Role.DEPARTMENT_MANAGER, Role.DEPARTMENT_SUPERVISOR, Role.REGISTRAR]


def _codes(response, key="code"):
    assert response.status_code == 200, response.data
    return {row[key] for row in response.data["results"]}


@pytest.mark.parametrize("role", DEPARTMENT_ROLES)
def test_structure_is_limited_to_own_departments(
    api, make_user, it_dept, ba_dept, it_program, ba_program, role
):
    user = make_user(role, department=it_dept)
    assert _codes(api(user).get("/api/v1/departments")) == {"IT"}
    assert _codes(api(user).get("/api/v1/programs")) == {"BIT"}
    assert _codes(api(user).get("/api/v1/programs", {"department": ba_dept.pk})) == set()
    assert api(user).get(f"/api/v1/departments/{ba_dept.pk}").status_code == 404
    assert api(user).get(f"/api/v1/programs/{ba_program.pk}").status_code == 404
    assert api(user).get(f"/api/v1/departments/{it_dept.pk}").status_code == 200


@pytest.mark.parametrize("role", [Role.SYSTEM_ADMIN, Role.HR, Role.ACADEMIC_AFFAIRS])
def test_college_roles_still_see_every_department(
    api, make_user, it_dept, ba_dept, it_program, ba_program, role
):
    user = make_user(role)
    assert _codes(api(user).get("/api/v1/departments")) == {"IT", "BA"}
    assert _codes(api(user).get("/api/v1/programs")) == {"BIT", "BBA"}


def test_intakes_are_limited_to_own_departments(
    api, make_user, term, it_dept, it_program, ba_program
):
    now = timezone.now()
    cycle = AdmissionCycle.objects.create(
        academic_year=term.academic_year,
        name="خريف 2026",
        opens_at=now,
        closes_at=now + timedelta(days=14),
    )
    ProgramIntake.objects.create(cycle=cycle, program=it_program)
    ProgramIntake.objects.create(cycle=cycle, program=ba_program)
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    head = make_user(Role.HEAD_REGISTRAR)
    rows = api(manager).get("/api/v1/intakes").data["results"]
    assert [r["program"] for r in rows] == [it_program.pk]
    assert len(api(head).get("/api/v1/intakes").data["results"]) == 2


def test_manager_opens_every_course_of_the_department(
    api, make_user, it_dept, it_offering, ba_offering
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    one = api(manager).get("/api/v1/me/courses", {"offering": it_offering.pk}).data
    assert [(c["offering_id"], c["my_role"]) for c in one] == [(it_offering.pk, "manager")]
    # Another department's course: nothing.
    assert api(manager).get("/api/v1/me/courses", {"offering": ba_offering.pk}).data == []
    # «موادي» still lists only the courses the manager teaches.
    assert api(manager).get("/api/v1/me/courses").data == []
    OfferingInstructor.objects.create(offering=it_offering, user=manager, role="teacher")
    listed = api(manager).get("/api/v1/me/courses").data
    assert [(c["offering_id"], c["my_role"]) for c in listed] == [(it_offering.pk, "teacher")]


def test_course_roles_by_relation(api, make_user, it_dept, it_offering, classroom):
    teacher, ta, student = classroom.teacher, classroom.ta, classroom.student
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    outsider = make_user(Role.TEACHER)
    for user, role in [(teacher, "teacher"), (ta, "ta"), (student, "student"), (affairs, "viewer")]:
        data = api(user).get("/api/v1/me/courses", {"offering": it_offering.pk}).data
        assert [c["my_role"] for c in data] == [role], user
    assert api(outsider).get("/api/v1/me/courses", {"offering": it_offering.pk}).data == []
    assert api(outsider).get("/api/v1/me/courses", {"offering": "x"}).data == []


def test_course_pickers_add_the_department_courses(
    api, make_user, it_dept, it_offering, ba_offering
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    rows = api(manager).get("/api/v1/me/courses", {"managed": 1}).data
    assert [(c["offering_id"], c["my_role"]) for c in rows] == [(it_offering.pk, "manager")]
    teacher = make_user(Role.TEACHER)
    assert api(teacher).get("/api/v1/me/courses", {"managed": 1}).data == []
