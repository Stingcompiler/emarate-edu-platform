"""What a department's and a programme's roles read in «سجل العمليات» (owner, 2026-11-15, option
«ب»): what happened to their students, courses and staff, whoever did it — not the college
administration's work (roles, accounts, structure, backups, settings), even filed under them."""

import pytest

from accounts.rbac import Role
from audit.models import AuditLog
from audit.views import ADMINISTRATION

pytestmark = pytest.mark.django_db

URL = "/api/v1/audit-logs"

# One action of each administrative kind, and academic ones that stay in sight.
HIDDEN = [
    "role.grant",
    "role.revoke",
    "account.create",
    "account.password_admin_reset",
    "department.update",
    "program.update",
    "program.links_end",
    "backup.restore",
    "settings.update",
    "site.settings",
    "term.set_current",
    "results.settings",
    "results.scale_update",
    "deletion.request",
]
SHOWN = [
    "enrollment.bulk",
    "students.create",
    "course.create",
    "offering.instructor_add",
    "membership.add",
    "results.commit",
]


def _actions(client) -> set[str]:
    response = client.get(URL, {"page_size": 500})
    assert response.status_code == 200, response.data
    return {row["action"] for row in response.data["results"]}


def test_the_rule_names_the_administrative_kinds_and_only_them():
    for action in HIDDEN + SHOWN:
        AuditLog.objects.create(action=action, target_type="x", target_id="1")
    matched = set(AuditLog.objects.filter(ADMINISTRATION).values_list("action", flat=True))
    assert matched == set(HIDDEN)


def test_the_department_and_programme_roles_read_their_work_not_the_administrations(
    api, make_user, it_dept, it_program
):
    admin = make_user(Role.SYSTEM_ADMIN)
    for action in HIDDEN + SHOWN:
        AuditLog.objects.create(
            action=action,
            actor=admin,
            target_type="x",
            target_id="1",
            target_repr=action,
            department=it_dept,
            program=it_program,
            ip="203.0.113.7",
        )
    viewers = [
        make_user(Role.DEPARTMENT_MANAGER, department=it_dept),
        make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept),
        make_user(Role.PROGRAM_MANAGER, program=it_program),
        make_user(Role.PROGRAM_SUPERVISOR, program=it_program),
    ]
    for viewer in viewers:
        seen = _actions(api(viewer))
        assert seen == set(SHOWN), (viewer.role_assignments.first().role, seen ^ set(SHOWN))
    # The college's administration reads everything.
    assert _actions(api(admin)) >= set(HIDDEN + SHOWN)
    assert _actions(api(make_user(Role.SYSTEM_SUPERVISOR))) >= set(HIDDEN + SHOWN)


def test_what_they_did_themselves_stays_in_their_log(api, make_user, it_dept):
    head = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    AuditLog.objects.create(
        action="deletion.request", actor=head, target_type="x", target_id="1", department=it_dept
    )
    assert "deletion.request" in _actions(api(head))


def test_the_address_an_action_came_from_is_the_system_admins_alone(api, make_user, it_dept):
    AuditLog.objects.create(
        action="students.create",
        target_type="x",
        target_id="1",
        department=it_dept,
        ip="203.0.113.7",
    )
    for role, extra in (
        (Role.DEPARTMENT_MANAGER, {"department": it_dept}),
        (Role.SYSTEM_SUPERVISOR, {}),
    ):
        rows = api(make_user(role, **extra)).get(URL).data["results"]
        assert rows and all(row["ip"] is None for row in rows), role
    rows = api(make_user(Role.SYSTEM_ADMIN)).get(URL).data["results"]
    assert rows[0]["ip"] == "203.0.113.7"
