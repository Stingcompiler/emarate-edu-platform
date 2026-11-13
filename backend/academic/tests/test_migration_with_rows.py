"""Migration 0006 on a database that already holds courses and staff.

CI migrates an empty database, where a data step touches no row: the first deploy on real data
(2026-11-13, PostgreSQL) failed with «cannot CREATE INDEX … because it has pending trigger
events» — rows changed, then a constraint added, in one transaction — and rolled back, so
nothing was deployed. This runs the migration through the executor over rows, forwards and
back, on whichever engine the suite uses (CI runs both).
"""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

BEFORE = [("academic", "0005_course_semester_range")]
AFTER = [("academic", "0006_programme_courses_and_members")]


def _migrate(target):
    """Academic at ``target``; every other app stays where the database has it (its head)."""
    executor = MigrationExecutor(connection)
    executor.migrate(target)
    loader = MigrationExecutor(connection).loader
    others = [node for node in loader.graph.leaf_nodes() if node[0] != "academic"]
    return loader.project_state(target + others).apps


@pytest.mark.django_db(transaction=True)
def test_courses_and_staff_that_exist_are_carried_over_and_back():
    apps = _migrate(BEFORE)
    college = apps.get_model("organization", "College").objects.create(code="C", name_ar="ك")
    Department = apps.get_model("organization", "Department")
    Program = apps.get_model("organization", "Program")
    it = Department.objects.create(college=college, code="IT", name_ar="تقنية المعلومات")
    ba = Department.objects.create(college=college, code="BA", name_ar="إدارة الأعمال")
    facts = {"degree": "bachelor", "levels_count": 4, "duration_terms": 8}
    for department, code in ((it, "B1"), (it, "B2"), (ba, "B3")):
        Program.objects.create(department=department, code=code, name_ar=code, **facts)
    Course = apps.get_model("academic", "Course")
    Course.objects.create(department=ba, code="BA1", name_ar="م")  # one programme: its
    Course.objects.create(department=it, code="S1", name_ar="م")  # two: stays shared
    teacher = apps.get_model("accounts", "User").objects.create(
        email="t@ecst.test", full_name_ar="أ"
    )
    Membership = apps.get_model("academic", "DepartmentMembership")
    Membership.objects.create(department=it, user=teacher, kind="teacher")

    apps = _migrate(AFTER)
    courses = apps.get_model("academic", "Course").objects
    assert dict(courses.values_list("code", "program__code")) == {"BA1": "B3", "S1": None}
    links = apps.get_model("academic", "DepartmentMembership").objects
    assert sorted(links.values_list("program__code", flat=True)) == ["B1", "B2"]

    apps = _migrate(BEFORE)
    assert apps.get_model("academic", "DepartmentMembership").objects.count() == 1

    # Back where the suite expects the schema.
    executor = MigrationExecutor(connection)
    executor.migrate(executor.loader.graph.leaf_nodes())
