"""Throwaway probes for the programme model review. Each asserts CORRECT behaviour."""

import pytest

from academic.models import (
    Course,
    CourseOffering,
    DepartmentMembership,
    Enrollment,
    OfferingInstructor,
)
from accounts.rbac import Role
from conftest import csv_upload
from organization.models import Program


@pytest.fixture
def diploma(it_dept):
    return Program.objects.create(
        department=it_dept, code="DIT", name_ar="دبلوم", degree="diploma",
        levels_count=2, duration_terms=4,
    )


def test_course_level_above_programme_levels_is_refused(api, make_user, diploma):
    admin = make_user(Role.SYSTEM_ADMIN)
    r = api(admin).post(
        "/api/v1/courses",
        {"program": diploma.pk, "code": "L5", "name_ar": "م", "default_level": 4},
        format="json",
    )
    assert r.status_code == 400, (r.status_code, r.data)


def test_course_patch_level_above_programme_levels_is_refused(api, make_user, diploma):
    admin = make_user(Role.SYSTEM_ADMIN)
    c = Course.objects.create(program=diploma, department=diploma.department, code="Q1", name_ar="م")
    r = api(admin).patch(f"/api/v1/courses/{c.pk}", {"default_level": 5}, format="json")
    assert r.status_code == 400, (r.status_code, r.data)


def test_legacy_course_moved_to_department_with_same_code_is_400_not_500(
    api, make_user, it_dept, ba_dept
):
    admin = make_user(Role.SYSTEM_ADMIN)
    Course.objects.create(department=ba_dept, code="OLD1", name_ar="قديمة ب")
    old = Course.objects.create(department=it_dept, code="OLD1", name_ar="قديمة أ")
    client = api(admin)
    client.raise_request_exception = False
    r = client.patch(f"/api/v1/courses/{old.pk}", {"department": ba_dept.pk}, format="json")
    assert r.status_code == 400, r.status_code


def test_department_results_file_with_same_code_in_two_programmes(
    api, make_user, make_student, it_dept, it_program, diploma, term
):
    head = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    a = Course.objects.create(program=it_program, department=it_dept, code="GEN1", name_ar="أ")
    b = Course.objects.create(program=diploma, department=it_dept, code="GEN1", name_ar="ب")
    oa = CourseOffering.objects.create(course=a, term=term)
    ob = CourseOffering.objects.create(course=b, term=term)
    sa = make_student(it_program, "26-A-1")
    sb = make_student(diploma, "26-B-1")
    Enrollment.objects.create(offering=oa, student_record=sa)
    Enrollment.objects.create(offering=ob, student_record=sb)
    body = {
        "file": csv_upload(
            "r.csv", "الرقم الجامعي,رمز المقرر,الدرجة", "26-A-1,GEN1,70", "26-B-1,GEN1,80"
        ),
        "term": term.pk,
        "department": it_dept.pk,
    }
    r = api(head).post("/api/v1/result-imports", body, format="multipart")
    assert r.status_code == 201, r.data
    assert r.data["summary"]["error"] == 0, r.data["summary"]


def test_removing_legacy_membership_keeps_assignments_of_programme_membership(
    api, make_user, it_dept, it_program, it_offering
):
    from academic import services
    from audit.services import RequestMeta

    head = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    teacher = make_user(Role.TEACHER)
    legacy = DepartmentMembership.objects.create(department=it_dept, user=teacher, kind="teacher")
    DepartmentMembership.objects.create(
        department=it_dept, program=it_program, user=teacher, kind="teacher"
    )
    OfferingInstructor.objects.create(offering=it_offering, user=teacher, role="teacher")
    services.remove_member(RequestMeta(actor=head), legacy)
    # still a member of BIT: the BIT course assignment should stay
    assert OfferingInstructor.objects.filter(offering=it_offering, user=teacher).exists()


def test_programme_head_bulk_enrolment_only_where_they_can_manage(
    api, make_user, make_student, it_dept, it_program, diploma, term
):
    """A legacy shared course of the department: bulk enrolment by the programme head puts
    students there, but the head can neither see nor drop those enrolments."""
    ph = make_user(Role.PROGRAM_MANAGER, program=it_program)
    shared = Course.objects.create(department=it_dept, code="SH1", name_ar="مشتركة")
    offering = CourseOffering.objects.create(course=shared, term=term)
    make_student(it_program, "26-A-9", level=1, semester=1)
    r = api(ph).post(
        "/api/v1/enrollments/bulk",
        {"term": term.pk, "program": it_program.pk, "level": 1},
        format="json",
    )
    assert r.status_code in (200, 201), r.data
    made = Enrollment.objects.filter(offering=offering)
    if made.exists():
        e = made.get()
        listed = api(ph).get("/api/v1/enrollments").data
        ids = [row["id"] for row in listed.get("results", listed)]
        assert e.id in ids, "enrolment made by the head is invisible to them"
