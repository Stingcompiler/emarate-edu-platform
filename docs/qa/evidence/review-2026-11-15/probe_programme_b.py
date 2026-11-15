"""Throwaway probes, batch B."""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from academic.models import Course, CourseOffering, DepartmentMembership, Enrollment
from accounts.models import RoleAssignment
from accounts.rbac import Role
from organization.models import Program

BEFORE = [("academic", "0005_course_semester_range")]
AFTER = [("academic", "0006_programme_courses_and_members")]


@pytest.fixture
def diploma(it_dept):
    return Program.objects.create(
        department=it_dept, code="DIT", name_ar="دبلوم", degree="diploma",
        levels_count=2, duration_terms=4,
    )


def test_public_programme_page_does_not_name_dept_head_when_programme_has_own_hidden_head(
    api, make_user, it_dept, it_program
):
    it_program.is_active = True
    it_program.save()
    make_user(Role.PROGRAM_MANAGER, program=it_program, public_profile=False)
    make_user(Role.DEPARTMENT_MANAGER, department=it_dept, public_profile=True,
              full_name_ar="مدير القسم")
    from organization.public import _program_head

    head = _program_head(it_program)
    # docs/03 §3.7أ: «رئيسه، وإن لم يكن له رئيس فمدير القسم» — it has a head (hidden).
    assert head is None, head


def test_programme_staff_audience_includes_member_from_other_department(
    make_user, it_program, ba_dept, ba_program
):
    from notifications import audience

    teacher = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(
        department=ba_dept, program=ba_program, user=teacher, kind="teacher"
    )
    DepartmentMembership.objects.create(
        department=it_program.department, program=it_program, user=teacher, kind="teacher"
    )
    sibling = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(
        department=ba_dept, program=ba_program, user=sibling, kind="teacher"
    )
    ph = make_user(Role.PROGRAM_MANAGER, program=it_program)
    clean = audience.authorize(ph, {"type": "program", "ids": [it_program.pk], "members": "staff"})
    ids = set(audience.resolve(clean).values_list("pk", flat=True))
    assert teacher.pk in ids and ph.pk in ids and sibling.pk not in ids


def _migrate(target):
    executor = MigrationExecutor(connection)
    executor.migrate(target)
    loader = MigrationExecutor(connection).loader
    others = [node for node in loader.graph.leaf_nodes() if node[0] != "academic"]
    return loader.project_state(target + others).apps


@pytest.mark.django_db(transaction=True)
def test_migration_0006_goes_back_after_two_programmes_share_a_code():
    apps = _migrate(AFTER)
    college = apps.get_model("organization", "College").objects.create(code="C", name_ar="ك")
    it = apps.get_model("organization", "Department").objects.create(
        college=college, code="IT", name_ar="ت"
    )
    Program = apps.get_model("organization", "Program")
    facts = {"degree": "bachelor", "levels_count": 4, "duration_terms": 8}
    p1 = Program.objects.create(department=it, code="B1", name_ar="B1", **facts)
    p2 = Program.objects.create(department=it, code="B2", name_ar="B2", **facts)
    Course = apps.get_model("academic", "Course")
    Course.objects.create(department=it, program=p1, code="X1", name_ar="م")
    Course.objects.create(department=it, program=p2, code="X1", name_ar="م")
    try:
        _migrate(BEFORE)
        ok = True
    except Exception as error:  # noqa: BLE001
        ok = repr(error)
    finally:
        executor = MigrationExecutor(connection)
        try:
            executor.migrate(executor.loader.graph.leaf_nodes())
        except Exception:  # noqa: BLE001
            pass
    assert ok is True, ok


def test_teachers_report_for_programme_head_counts_member_with_earlier_link_elsewhere(
    make_user, it_dept, it_program, ba_dept, ba_program, it_offering, term
):
    """A teacher linked first to BA's programme, then to BIT, teaching BIT's course: the BIT
    head's teachers report, asked for the IT department, lists them."""
    from accounts import rbac
    from reports import metrics

    teacher = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(
        department=ba_dept, program=ba_program, user=teacher, kind="teacher"
    )
    DepartmentMembership.objects.create(
        department=it_dept, program=it_program, user=teacher, kind="teacher"
    )
    it_offering.instructors.create(user=teacher, role="teacher")
    # Mixed user: department head of BA and programme head of BIT.
    user = make_user(Role.PROGRAM_MANAGER, program=it_program)
    RoleAssignment.objects.create(user=user, role=Role.DEPARTMENT_MANAGER, department=ba_dept)
    rbac.clear_cache(user)
    scope = rbac.scope_for(user, "reports.teachers")
    rows = metrics.teacher_rows(term, scope, department_id=it_dept.pk)
    assert teacher.pk in {r["id"] for r in rows}
