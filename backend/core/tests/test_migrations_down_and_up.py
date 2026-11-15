"""Every app's latest migration goes back and forward again over rows (review 2026-11-15,
R103/R106): CI migrates an empty database, where a step back that leaves rows the step
forward refuses never shows — on the server it is the way a release is rolled back. Runs on
whichever engine the suite uses (CI runs both)."""

import pytest
from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader

from core.tests.test_permission_matrix import world  # noqa: F401  (rows in every app)


def _latest() -> list[tuple[str, str, str]]:
    """(app, its latest migration, the one before) for the platform's own apps."""
    loader = MigrationLoader(None, ignore_no_migrations=True)
    found = []
    for app, name in sorted(loader.graph.leaf_nodes()):
        if not (settings.BASE_DIR / app).is_dir():
            continue  # Django's and the libraries' own
        parents = [p for p in loader.graph.node_map[(app, name)].parents if p.key[0] == app]
        if parents:  # an app with a single migration would go back to nothing at all
            found.append((app, name, parents[0].key[1]))
    return found


def _leaves():
    executor = MigrationExecutor(connection)
    return executor, executor.loader.graph.leaf_nodes()


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(("app", "latest", "before"), _latest())
def test_the_latest_migration_goes_back_and_forward_over_rows(world, app, latest, before):  # noqa: F811
    from accounts.models import User

    people = User.objects.count()
    executor, leaves = _leaves()
    try:
        executor.migrate([(app, before)])
        executor, leaves = _leaves()
        executor.migrate(leaves)
    finally:
        executor, leaves = _leaves()
        executor.migrate(leaves)  # where the rest of the suite expects the schema
    assert User.objects.count() == people


@pytest.mark.django_db(transaction=True)
def test_going_back_before_programme_courses_names_the_codes_in_the_way(
    it_dept, it_program, make_user
):
    """Two programmes of a department may use one code; before them a code was the
    department's. Going back says which, instead of a constraint error (R106)."""
    from academic.models import Course
    from organization.models import Program

    other = Program.objects.create(
        department=it_dept,
        code="DIT",
        name_ar="دبلوم",
        degree="diploma",
        levels_count=2,
        duration_terms=4,
    )
    Course.objects.create(program=it_program, department=it_dept, code="GEN1", name_ar="أ")
    Course.objects.create(program=other, department=it_dept, code="GEN1", name_ar="ب")
    executor, _ = _leaves()
    try:
        with pytest.raises(RuntimeError, match=r"IT/GEN1"):
            executor.migrate([("academic", "0005_course_semester_range")])
    finally:
        executor, leaves = _leaves()
        executor.migrate(leaves)
    assert Course.objects.filter(code="GEN1").count() == 2
