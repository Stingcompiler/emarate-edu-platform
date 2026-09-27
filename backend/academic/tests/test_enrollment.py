"""Enrollment, department members, instructors and /me/courses."""

import pytest

from academic.models import Course, CourseOffering, DepartmentMembership, Enrollment
from accounts.rbac import Role
from audit.models import AuditLog


@pytest.fixture
def manager(make_user, it_dept):
    return make_user(Role.DEPARTMENT_MANAGER, department=it_dept)


@pytest.fixture
def supervisor(make_user, it_dept):
    return make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)


@pytest.fixture
def cohort(make_student, it_program):
    """Three level-1 IT students (one suspended) and one level-2 student."""
    return [
        make_student(it_program, "26-IT-0001", level=1),
        make_student(it_program, "26-IT-0002", level=1),
        make_student(it_program, "26-IT-0003", level=1, status="suspended"),
        make_student(it_program, "26-IT-0004", level=2),
    ]


def test_bulk_enroll_is_idempotent(api, manager, term, it_program, it_offering, cohort):
    shared = Course.objects.create(
        department=it_program.department, code="IT100", name_ar="مهارات الحاسوب"
    )  # no program = shared by the department's programs
    CourseOffering.objects.create(course=shared, term=term)
    body = {"term": term.pk, "program": it_program.pk, "level": 1}
    first = api(manager).post("/api/v1/enrollments/bulk", body)
    assert first.status_code == 200, first.data
    assert first.data == {"offerings": 2, "students": 2, "created": 4, "already_enrolled": 0}
    cohort.append(
        cohort[0].__class__.objects.create(
            program=it_program, university_number="26-IT-0005", full_name_ar="جديد", level=1
        )
    )
    second = api(manager).post("/api/v1/enrollments/bulk", body).data
    assert second == {"offerings": 2, "students": 3, "created": 2, "already_enrolled": 4}
    assert Enrollment.objects.count() == 6
    assert AuditLog.objects.filter(action="enrollment.bulk").count() == 2


def test_bulk_enroll_outside_scope_is_forbidden(api, manager, term, ba_program, ba_offering):
    body = {"term": term.pk, "program": ba_program.pk, "level": 1}
    assert api(manager).post("/api/v1/enrollments/bulk", body).status_code == 403
    assert not Enrollment.objects.exists()


def test_enroll_and_drop(api, supervisor, it_offering, cohort):
    student = cohort[0]
    body = {"offering": it_offering.pk, "student_record": str(student.public_id)}
    created = api(supervisor).post("/api/v1/enrollments", body)
    assert created.status_code == 201, created.data
    assert api(supervisor).post("/api/v1/enrollments", body).status_code == 409
    dropped = api(supervisor).post(f"/api/v1/enrollments/{created.data['id']}/drop")
    assert dropped.data["status"] == "dropped"
    # Re-enrolling reactivates the same row.
    assert api(supervisor).post("/api/v1/enrollments", body).status_code == 201
    assert Enrollment.objects.get().status == "active"


def test_suspended_student_cannot_be_enrolled(api, manager, it_offering, cohort):
    body = {"offering": it_offering.pk, "student_record": str(cohort[2].public_id)}
    assert api(manager).post("/api/v1/enrollments", body).status_code == 400


def test_enrollment_list_is_scoped(api, make_user, ba_dept, manager, it_offering, cohort):
    Enrollment.objects.create(offering=it_offering, student_record=cohort[0])
    other = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(manager).get("/api/v1/enrollments").data["count"] == 1
    assert api(other).get("/api/v1/enrollments").data["count"] == 0


def test_members_and_instructors(api, make_user, manager, supervisor, it_dept, it_offering):
    teacher = make_user(Role.TEACHER)
    not_a_teacher = make_user(Role.HR)
    members = f"/api/v1/departments/{it_dept.pk}/members"

    bad = api(supervisor).post(members, {"user": str(not_a_teacher.public_id), "kind": "teacher"})
    assert bad.status_code == 400

    # An instructor must belong to the department first.
    instructors = f"/api/v1/offerings/{it_offering.pk}/instructors"
    body = {"user": str(teacher.public_id), "role": "teacher"}
    assert api(supervisor).post(instructors, body).status_code == 400

    added = api(supervisor).post(members, {"user": str(teacher.public_id), "kind": "teacher"})
    assert added.status_code == 201, added.data
    assert (
        api(supervisor)
        .post(members, {"user": str(teacher.public_id), "kind": "teacher"})
        .status_code
        == 409
    )
    assert len(api(manager).get(members).data) == 1

    assigned = api(supervisor).post(instructors, body)
    assert assigned.status_code == 201, assigned.data
    detail = f"{instructors}/{assigned.data['id']}"
    member = f"{members}/{added.data['id']}"
    # Supervisor = manager without removal.
    assert api(supervisor).delete(detail).status_code == 403
    assert api(supervisor).delete(member).status_code == 403
    # Removing the member also removes their open teaching assignments.
    assert api(manager).delete(member).status_code == 204
    assert not DepartmentMembership.objects.exists()
    assert not it_offering.instructors.exists()


def test_other_department_members_are_hidden(api, make_user, ba_dept, it_dept):
    other = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(other).get(f"/api/v1/departments/{it_dept.pk}/members").status_code == 404


def test_my_courses(api, make_user, it_offering, ba_offering, cohort):
    student_user = make_user(Role.STUDENT)
    cohort[0].user = student_user
    cohort[0].save()
    Enrollment.objects.create(offering=it_offering, student_record=cohort[0])
    teacher = make_user(Role.TEACHER)
    it_offering.instructors.create(user=teacher, role="teacher")
    ta = make_user(Role.TA)
    ba_offering.instructors.create(user=ta, role="ta")

    mine = api(student_user).get("/api/v1/me/courses").data
    assert [(c["code"], c["my_role"]) for c in mine] == [("IT101", "student")]
    teaching = api(teacher).get("/api/v1/me/courses").data
    assert [(c["code"], c["my_role"]) for c in teaching] == [("IT101", "teacher")]
    assert [c["my_role"] for c in api(ta).get("/api/v1/me/courses").data] == ["ta"]
