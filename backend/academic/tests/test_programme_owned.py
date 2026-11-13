"""Courses and teaching staff belong to programmes; the department is their container
(owner, 2026-11-13)."""

import importlib

import pytest

from academic.models import Course, CourseOffering, DepartmentMembership, OfferingInstructor
from accounts.rbac import Role
from organization.models import Program


@pytest.fixture
def manager(make_user, it_dept):
    return make_user(Role.DEPARTMENT_MANAGER, department=it_dept)


@pytest.fixture
def diploma(it_dept):
    return Program.objects.create(
        department=it_dept,
        code="DIT",
        name_ar="دبلوم تقنية المعلومات",
        degree="diploma",
        levels_count=2,
        duration_terms=4,
    )


def test_a_course_belongs_to_one_programme(api, manager, it_dept, it_program, diploma, ba_dept):
    client = api(manager)
    none = client.post("/api/v1/courses", {"department": it_dept.pk, "code": "X1", "name_ar": "م"})
    assert none.status_code == 400 and "program" in none.data["errors"]
    # The department is the programme's, whatever is sent; another department's is refused.
    made = client.post("/api/v1/courses", {"program": it_program.pk, "code": "X1", "name_ar": "م"})
    assert made.status_code == 201, made.data
    assert made.data["department"] == it_dept.pk
    wrong = client.post(
        "/api/v1/courses",
        {"program": it_program.pk, "department": ba_dept.pk, "code": "X2", "name_ar": "م"},
    )
    assert wrong.status_code == 400
    # Two programmes of a department may each have a course of the same code and name; one
    # programme cannot have it twice.
    twin = client.post("/api/v1/courses", {"program": diploma.pk, "code": "X1", "name_ar": "م"})
    assert twin.status_code == 201, twin.data
    again = client.post("/api/v1/courses", {"program": diploma.pk, "code": "X1", "name_ar": "م"})
    assert again.status_code == 400
    # A course is never left without a programme again.
    url = f"/api/v1/courses/{made.data['id']}"
    assert client.patch(url, {"program": None}, format="json").status_code == 400
    assert client.patch(url, {"program": diploma.pk}, format="json").status_code == 400  # X1 there


def test_a_course_from_before_keeps_working_until_it_gets_a_programme(
    api, manager, it_dept, it_program
):
    old = Course.objects.create(department=it_dept, code="OLD1", name_ar="مادة قديمة")
    url = f"/api/v1/courses/{old.pk}"
    assert (
        api(manager).patch(url, {"name_ar": "مادة قديمة مصحّحة"}, format="json").status_code == 200
    )
    given = api(manager).patch(url, {"program": it_program.pk}, format="json")
    assert given.status_code == 200 and given.data["program"] == it_program.pk


def test_staff_join_programmes_of_any_department(
    api, make_user, manager, it_dept, it_program, diploma, ba_dept, ba_program, ba_offering
):
    teacher = make_user(Role.TEACHER, full_name_ar="د. منى")
    client = api(manager)
    url = f"/api/v1/departments/{it_dept.pk}/members"
    body = {"user": str(teacher.public_id), "kind": "teacher"}
    # Two programmes: which one? Then each programme once.
    assert client.post(url, body, format="json").status_code == 400
    one = client.post(url, {**body, "program": it_program.pk}, format="json")
    assert one.status_code == 201 and one.data["program"] == it_program.pk
    assert one.data["program_name"] == it_program.name_ar
    assert client.post(url, {**body, "program": diploma.pk}, format="json").status_code == 201
    assert client.post(url, {**body, "program": diploma.pk}, format="json").status_code == 409
    # Another department's programme is not this department's to give.
    assert client.post(url, {**body, "program": ba_program.pk}, format="json").status_code == 400
    # … but the same person joins a programme there too (many to many, any department).
    admin = api(make_user(Role.SYSTEM_ADMIN))
    there = admin.post(f"/api/v1/departments/{ba_dept.pk}/members", body, format="json")
    assert there.status_code == 201 and there.data["program"] == ba_program.pk  # its only one
    assert DepartmentMembership.objects.filter(user=teacher).count() == 3
    assert {m["program"] for m in client.get(url).data} == {it_program.pk, diploma.pk}


def test_a_department_assigns_the_members_of_the_courses_programme(
    api, make_user, manager, it_program, diploma, term
):
    teacher = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(program=diploma, user=teacher, kind="teacher")
    course = Course.objects.create(program=it_program, code="IT500", name_ar="م")
    offering = CourseOffering.objects.create(course=course, term=term)
    url = f"/api/v1/offerings/{offering.pk}/instructors"
    body = {"user": str(teacher.public_id), "role": "teacher"}
    # Linked to the diploma only: not this bachelor's course.
    assert api(manager).post(url, body, format="json").status_code == 400
    mine = DepartmentMembership.objects.create(program=it_program, user=teacher, kind="teacher")
    assert api(manager).post(url, body, format="json").status_code == 201
    # Leaving the programme ends the teaching in it, and only in it.
    other = CourseOffering.objects.create(
        course=Course.objects.create(program=diploma, code="D500", name_ar="م"), term=term
    )
    OfferingInstructor.objects.create(offering=other, user=teacher, role="teacher")
    removed = api(manager).delete(
        f"/api/v1/departments/{it_program.department_id}/members/{mine.pk}"
    )
    assert removed.status_code == 204
    assert not OfferingInstructor.objects.filter(offering=offering).exists()
    assert OfferingInstructor.objects.filter(offering=other).exists()


def test_a_programme_takes_its_staff_to_another_department(api, make_user, it_program, ba_dept):
    teacher = make_user(Role.TEACHER)
    membership = DepartmentMembership.objects.create(program=it_program, user=teacher, kind="ta")
    admin = api(make_user(Role.SYSTEM_ADMIN))
    moved = admin.patch(
        f"/api/v1/programs/{it_program.pk}", {"department": ba_dept.pk}, format="json"
    )
    assert moved.status_code == 200, moved.data
    membership.refresh_from_db()
    assert membership.department_id == ba_dept.pk


@pytest.mark.django_db
def test_what_existed_is_carried_over(
    make_user, it_dept, it_program, diploma, ba_dept, ba_program, term, make_student
):
    """The data migration: a programme where it is certain, nothing guessed."""
    from django.apps import apps

    teacher, idle = make_user(Role.TEACHER), make_user(Role.TA)
    only = Course.objects.create(department=ba_dept, code="BA1", name_ar="م")  # one programme
    studied = Course.objects.create(department=it_dept, code="S1", name_ar="م")
    mixed = Course.objects.create(department=it_dept, code="S2", name_ar="م")
    taught = Course.objects.create(program=diploma, code="T1", name_ar="م")
    from academic.models import Enrollment

    first = make_student(it_program, "26-IT-0001")
    second = make_student(diploma, "26-IT-0002")
    for course, students in ((studied, [first]), (mixed, [first, second])):
        offering = CourseOffering.objects.create(course=course, term=term)
        for student in students:
            Enrollment.objects.create(offering=offering, student_record=student)
    OfferingInstructor.objects.create(
        offering=CourseOffering.objects.create(course=taught, term=term),
        user=teacher,
        role="teacher",
    )
    for user, kind in ((teacher, "teacher"), (idle, "ta")):
        DepartmentMembership.objects.create(department=it_dept, user=user, kind=kind)
    migration = importlib.import_module("academic.migrations.0006_programme_courses_and_members")
    migration.forwards(apps, None)
    for course in (only, studied, mixed):
        course.refresh_from_db()
    assert (only.program_id, studied.program_id, mixed.program_id) == (
        ba_program.pk,
        it_program.pk,
        None,
    )
    links = lambda user: set(  # noqa: E731
        DepartmentMembership.objects.filter(user=user).values_list("program_id", flat=True)
    )
    assert links(teacher) == {diploma.pk}  # where they teach
    assert links(idle) == {it_program.pk, diploma.pk}  # nowhere yet: every programme
    migration.backwards(apps, None)
    assert DepartmentMembership.objects.count() == 2
