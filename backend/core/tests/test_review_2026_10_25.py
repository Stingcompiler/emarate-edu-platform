"""Review 2026-10-25, group 3: department scope (R13), notification audience (R22), query
counts (R23) and the Django admin (R24). Each test fails on the code before the fix."""

from datetime import timedelta

import pytest
from django.contrib import admin
from django.db import connection
from django.test import RequestFactory
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.rbac import Role
from admissions.models import AdmissionCycle, ApplicationFormTemplate, ProgramIntake


def _cycle(name, program, year):
    now = timezone.now()
    cycle = AdmissionCycle.objects.create(
        academic_year=year,
        name=name,
        opens_at=now - timedelta(days=1),
        closes_at=now + timedelta(days=9),
    )
    ProgramIntake.objects.create(cycle=cycle, program=program)
    return cycle


def test_department_roles_see_only_their_departments_cycles(
    api, make_user, it_dept, it_program, ba_program, term
):
    """docs/03 §3.6: lists of admission cycles are limited to the department (R13)."""
    it_cycle = _cycle("دورة تقنية المعلومات", it_program, term.academic_year)
    ba_cycle = _cycle("دورة إدارة الأعمال", ba_program, term.academic_year)
    for role in (Role.REGISTRAR, Role.DEPARTMENT_MANAGER, Role.DEPARTMENT_SUPERVISOR):
        user = make_user(role, department=it_dept)
        listed = [c["id"] for c in api(user).get("/api/v1/admission-cycles").data["results"]]
        assert listed == [it_cycle.pk], role
        assert api(user).get(f"/api/v1/admission-cycles/{ba_cycle.pk}").status_code == 404
    head = make_user(Role.HEAD_REGISTRAR)
    assert api(head).get("/api/v1/admission-cycles").data["count"] == 2


def test_result_display_settings_are_not_for_department_roles(api, make_user, it_dept):
    """docs/03 §7 «نتائج: إعدادات العرض»: sys and results officer manage, the head registrar
    reads, department roles see nothing (R13)."""
    urls = [
        "/api/v1/results/settings",
        "/api/v1/results/grading-scales",
        "/api/v1/results/term-releases",
    ]
    for role in (Role.DEPARTMENT_MANAGER, Role.DEPARTMENT_SUPERVISOR):
        user = make_user(role, department=it_dept)
        assert [api(user).get(u).status_code for u in urls] == [403, 403, 403], role
    for role in (Role.HEAD_REGISTRAR, Role.RESULTS_OFFICER):
        assert [api(make_user(role)).get(u).status_code for u in urls] == [200, 200, 200], role


def test_academic_affairs_reaches_teachers_and_tas_not_registrars(make_user, it_dept):
    """docs/03 §7 «إعلانات»: academic affairs addresses teachers (R22). A department's "staff"
    holds its registrars, so academic affairs addresses teachers and TAs by role instead."""
    from academic.models import DepartmentMembership
    from notifications import audience

    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    teacher, ta = make_user(Role.TEACHER), make_user(Role.TA)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    DepartmentMembership.objects.create(department=it_dept, user=teacher, kind="teacher")
    DepartmentMembership.objects.create(department=it_dept, user=ta, kind="ta")
    staff = audience.normalize({"type": "department", "ids": [it_dept.pk], "members": "staff"})
    assert not audience.is_allowed(affairs, staff)
    by_role = audience.authorize(
        affairs, {"type": "role", "roles": ["teacher", "ta"], "departments": [it_dept.pk]}
    )
    assert set(audience.resolve(by_role)) == {teacher, ta}
    assert registrar not in set(audience.resolve(by_role))


@pytest.mark.django_db
def test_the_submissions_list_does_not_count_versions_per_student(
    api, classroom, make_user, make_student, it_program
):
    """R23: one versions count query per submission before."""
    from academic.models import Enrollment

    teacher = api(classroom.teacher)
    made = teacher.post(
        "/api/v1/assignments",
        {
            "offering": classroom.offering.pk,
            "title": "واجب",
            "due_at": (timezone.now() + timedelta(days=3)).isoformat(),
            "submission_types": ["text"],
            "max_grade": "10",
        },
        format="json",
    ).data["public_id"]
    teacher.post(f"/api/v1/assignments/{made}/publish")
    url = f"/api/v1/assignments/{made}/submissions"

    def submit(n, start):
        for i in range(n):
            user = make_user(Role.STUDENT)
            record = make_student(it_program, f"26-IT-{start + i:04d}", user=user)
            Enrollment.objects.create(offering=classroom.offering, student_record=record)
            body = {"content": "حل"}
            assert (
                api(user)
                .post(f"/api/v1/assignments/{made}/submit", body, format="json")
                .status_code
                == 201
            )

    def queries(path):
        # The query log keeps the last 9000 entries; start each count from an empty one.
        connection.queries_log.clear()
        with CaptureQueriesContext(connection) as seen:
            assert teacher.get(path).status_code == 200
        return len(seen)

    queue = "/api/v1/grading-queue"
    submit(2, 500)
    few = (queries(url), queries(queue))
    submit(4, 600)
    assert (queries(url), queries(queue)) == few


def test_admin_cannot_delete_results_or_change_a_published_template(make_user, db):
    """R24: the Django admin bypassed the services: a result could be deleted (then imported
    again outside the correction workflow) and a published template edited in place."""
    from django.contrib.auth import get_user_model

    from results.models import AcademicResult

    request = RequestFactory().get("/admin/")
    request.user = get_user_model().objects.create_superuser(
        email="root@ecst.test", password="x-Strong-pass-2026"
    )
    results = admin.site._registry[AcademicResult]
    assert not results.has_delete_permission(request)
    templates = admin.site._registry[ApplicationFormTemplate]
    draft = ApplicationFormTemplate.objects.create(
        name="نموذج", schema={"fields": []}, created_by=request.user
    )
    published = ApplicationFormTemplate.objects.create(
        name="نموذج منشور", schema={"fields": []}, status="published", created_by=request.user
    )
    assert templates.has_change_permission(request, draft)
    assert not templates.has_change_permission(request, published)
    assert not templates.has_delete_permission(request, published)
