"""Review 2026-11-15, fix 4 (R99–R102, R104, R107–R109): departments and programmes, where
the two meet — a student of another department, two programmes' courses with one code, a
membership from before programmes, a programme head's bulk enrolment, the reports, the
programme's public page and an HR notice's copy."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from academic import services as academic
from academic.models import (
    Course,
    CourseOffering,
    DepartmentMembership,
    Enrollment,
    OfferingInstructor,
)
from accounts.rbac import Role
from audit.services import RequestMeta
from conftest import csv_upload
from organization.models import Program

pytestmark = pytest.mark.django_db


@pytest.fixture
def diploma(it_dept):
    return Program.objects.create(
        department=it_dept,
        code="DIT",
        name_ar="دبلوم",
        degree="diploma",
        levels_count=2,
        duration_terms=4,
    )


# ─── R99: another department's student in this department's course ─────────────────────


def test_a_department_does_not_drop_another_departments_student(
    api, make_user, make_student, it_dept, ba_program, it_offering
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    theirs = make_student(ba_program, "26-BA-0001")
    enrollment = Enrollment.objects.create(offering=it_offering, student_record=theirs)
    client = api(manager)
    # Seen in the course's list (the owner's decision 1)…
    listed = client.get(f"/api/v1/enrollments?offering={it_offering.pk}").data
    rows = listed.get("results", listed)
    assert enrollment.pk in [row["id"] for row in rows]
    # …not dropped from here: the head registrar who enrolled them does that.
    assert client.post(f"/api/v1/enrollments/{enrollment.pk}/drop").status_code == 403
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.ACTIVE
    registrar = make_user(Role.HEAD_REGISTRAR)
    assert api(registrar).post(f"/api/v1/enrollments/{enrollment.pk}/drop").status_code == 200


# ─── R100: one code in two programmes, in a department's results file ──────────────────


def test_a_department_results_file_finds_each_students_own_course(
    api, make_user, make_student, it_dept, it_program, diploma, term
):
    head = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    a = Course.objects.create(program=it_program, department=it_dept, code="GEN1", name_ar="أ")
    b = Course.objects.create(program=diploma, department=it_dept, code="GEN1", name_ar="ب")
    in_a = CourseOffering.objects.create(course=a, term=term)
    in_b = CourseOffering.objects.create(course=b, term=term)
    Enrollment.objects.create(offering=in_a, student_record=make_student(it_program, "26-A-1"))
    Enrollment.objects.create(offering=in_b, student_record=make_student(diploma, "26-B-1"))
    body = {
        "file": csv_upload(
            "r.csv", "الرقم الجامعي,رمز المقرر,الدرجة", "26-A-1,GEN1,70", "26-B-1,GEN1,80"
        ),
        "term": term.pk,
        "department": it_dept.pk,
    }
    made = api(head).post("/api/v1/result-imports", body, format="multipart")
    assert made.status_code == 201, made.data
    assert made.data["summary"]["error"] == 0, made.data


# ─── R101: a membership from before programmes is removed ──────────────────────────────


def test_removing_a_departments_old_membership_keeps_the_programmes_teaching(
    make_user, it_dept, it_program, it_offering, ba_dept
):
    head = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    teacher = make_user(Role.TEACHER)
    legacy = DepartmentMembership.objects.create(department=it_dept, user=teacher, kind="teacher")
    DepartmentMembership.objects.create(
        department=it_dept, program=it_program, user=teacher, kind="teacher"
    )
    OfferingInstructor.objects.create(offering=it_offering, user=teacher, role="teacher")
    old_course = Course.objects.create(department=it_dept, code="OLD9", name_ar="قديمة")
    old = CourseOffering.objects.create(course=old_course, term=it_offering.term)
    OfferingInstructor.objects.create(offering=old, user=teacher, role="teacher")
    academic.remove_member(RequestMeta(actor=head), legacy)
    # Still a member of the programme: its course stays theirs; the department's old course,
    # which only the removed membership covered, goes.
    assert OfferingInstructor.objects.filter(offering=it_offering, user=teacher).exists()
    assert not OfferingInstructor.objects.filter(offering=old, user=teacher).exists()


# ─── R102: a programme head's bulk enrolment ───────────────────────────────────────────


def test_a_programme_heads_bulk_enrolment_leaves_the_departments_old_courses(
    api, make_user, make_student, it_dept, it_program, term
):
    shared = Course.objects.create(department=it_dept, code="SH1", name_ar="مشتركة")
    shared_offering = CourseOffering.objects.create(course=shared, term=term)
    own = Course.objects.create(program=it_program, department=it_dept, code="BIT9", name_ar="م")
    own_offering = CourseOffering.objects.create(course=own, term=term)
    make_student(it_program, "26-A-9", level=1, semester=1)
    body = {"term": term.pk, "program": it_program.pk, "level": 1}
    head = make_user(Role.PROGRAM_MANAGER, program=it_program)
    made = api(head).post("/api/v1/enrollments/bulk", body, format="json")
    assert made.status_code in (200, 201), made.data
    assert Enrollment.objects.filter(offering=own_offering).exists()
    assert not Enrollment.objects.filter(offering=shared_offering).exists()
    # The department's manager enrolls in them as before.
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    api(manager).post("/api/v1/enrollments/bulk", body, format="json")
    assert Enrollment.objects.filter(offering=shared_offering).exists()


# ─── R104, R108: the teachers' report ──────────────────────────────────────────────────


def test_the_teachers_report_counts_only_the_departments_cohort_sessions(
    api, make_user, it_dept, ba_program, it_offering, term
):
    from core.crypto import encrypt
    from live.models import LiveSession

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    host = make_user(Role.TEACHER)
    it_offering.instructors.create(user=host, role="teacher")
    now = timezone.now()
    LiveSession.objects.create(  # another department's cohort session the same person hosts
        scope=LiveSession.Scope.COHORT,
        program=ba_program,
        level=1,
        title="BA",
        provider="teams",
        join_url_encrypted=encrypt("https://teams.test/ba"),
        starts_at=now - timedelta(days=1),
        ends_at=now - timedelta(days=1) + timedelta(hours=1),
        host=host,
    )
    data = api(manager).get(f"/api/v1/reports/teachers?term={term.pk}").data
    row = next(r for r in data["rows"] if r["public_id"] == str(host.public_id))
    assert (row["live_held"], row["live_planned"]) == (0, 0)


def test_the_teachers_report_of_a_department_keeps_who_belongs_to_two(
    api, make_user, it_dept, ba_dept, term
):
    from reports.metrics import teacher_rows

    teacher = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(department=ba_dept, user=teacher, kind="teacher")
    DepartmentMembership.objects.create(department=it_dept, user=teacher, kind="teacher")
    from accounts import rbac

    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    scope = rbac.scope_for(affairs, "reports.teachers")
    rows = teacher_rows(term, scope, department_id=it_dept.pk)
    assert [r["id"] for r in rows] == [teacher.pk]
    assert rows[0]["department_id"] == it_dept.pk


# ─── R107: the programme's public page ─────────────────────────────────────────────────


def test_a_programme_with_a_head_who_does_not_appear_names_nobody_else(
    api, make_user, it_dept, it_program
):
    from django.core.cache import cache

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept, full_name_ar="د. مدير")
    manager.public_profile = True
    manager.save(update_fields=["public_profile"])
    make_user(Role.PROGRAM_MANAGER, program=it_program, full_name_ar="د. رئيس")
    cache.clear()
    assert api().get(f"/api/public/programs/{it_program.code}").data["head"] is None


# ─── R109: an HR notice's copy ─────────────────────────────────────────────────────────


def test_an_hr_notices_copy_reaches_the_heads_of_the_teachers_programme(
    make_user, it_dept, it_program
):
    from notifications import events

    teacher = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(
        department=it_dept, program=it_program, user=teacher, kind="teacher"
    )
    head = make_user(Role.PROGRAM_MANAGER, program=it_program)

    class Notice:
        subject = "تأخر التصحيح"
        body = "..."

    Notice.teacher = teacher
    with patch.object(events, "notify") as notify:
        events.hr_notice_copy(Notice)
    assert [u.pk for u in notify.call_args.args[0]] == [head.pk]
