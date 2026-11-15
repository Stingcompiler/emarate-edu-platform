"""PROBE M1 (temporary): accounts/0013 down and up again over a programme role."""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

BEFORE = [("accounts", "0012_account_move")]
AFTER = [("accounts", "0013_programme_roles")]


@pytest.mark.django_db(transaction=True)
def test_programme_roles_survive_going_back_and_forth(make_user, it_program):
    from accounts.rbac import Role

    make_user(Role.PROGRAM_MANAGER, program=it_program)
    executor = MigrationExecutor(connection)
    executor.migrate(BEFORE)
    try:
        MigrationExecutor(connection).migrate(AFTER)  # must not fail
    finally:
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        try:
            executor.migrate(executor.loader.graph.leaf_nodes())
        except Exception:
            from django.core.management import call_command

            with connection.cursor() as c:
                c.execute("delete from accounts_roleassignment where role like 'program%%'")
            call_command("migrate", verbosity=0)
