"""Who the site's department pages and «الكوادر» show changes with roles, memberships, names and
whether an account is active: each of these writes asks for a site rebuild (review 2026-11-12 —
they waited for the six-hourly build: a new head appeared hours late)."""

import pytest

from academic.models import DepartmentMembership
from accounts.rbac import Role


@pytest.fixture
def rebuilds(settings, monkeypatch):
    from content import tasks

    settings.SITE_REBUILD_HOOK_URL = "https://api.example.test/deploy-hook"
    calls = []
    monkeypatch.setattr(tasks.trigger_site_rebuild, "apply_async", lambda **kw: calls.append(kw))
    return calls


def _write(api, actor, request, django_capture_on_commit_callbacks, rebuilds):
    from django.core.cache import cache

    cache.delete("site-rebuild-pending")  # each write on its own, not debounced into the last
    before = len(rebuilds)
    with django_capture_on_commit_callbacks(execute=True):
        response = request(api(actor))
    assert response.status_code < 300, response.data
    return len(rebuilds) - before


def test_staff_writes_rebuild_the_site(
    api, make_user, it_dept, rebuilds, django_capture_on_commit_callbacks
):
    admin = make_user(Role.SYSTEM_ADMIN)
    head = make_user(Role.TEACHER)
    teacher = make_user(Role.TEACHER)
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)

    def run(actor, request):
        return _write(api, actor, request, django_capture_on_commit_callbacks, rebuilds)

    # A head of department appointed, then removed.
    assert (
        run(
            admin,
            lambda c: c.post(
                "/api/v1/role-assignments",
                {
                    "user": str(head.public_id),
                    "role": Role.DEPARTMENT_MANAGER,
                    "department": it_dept.pk,
                },
                format="json",
            ),
        )
        == 1
    )
    assignment = head.role_assignments.get(role=Role.DEPARTMENT_MANAGER)
    assert run(admin, lambda c: c.delete(f"/api/v1/role-assignments/{assignment.pk}")) == 1
    # A member added to the department, then removed.
    assert (
        run(
            manager,
            lambda c: c.post(
                f"/api/v1/departments/{it_dept.pk}/members",
                {"user": str(teacher.public_id), "kind": "teacher"},
                format="json",
            ),
        )
        == 1
    )
    membership = DepartmentMembership.objects.get(user=teacher)
    assert (
        run(
            manager, lambda c: c.delete(f"/api/v1/departments/{it_dept.pk}/members/{membership.pk}")
        )
        == 1
    )
    # Renamed by the admin; disabled and enabled again.
    assert (
        run(
            admin,
            lambda c: c.patch(
                f"/api/v1/users/{teacher.public_id}", {"full_name_ar": "د. اسم مصحَّح"}, format="json"
            ),
        )
        == 1
    )
    for active in (False, True):
        assert (
            run(
                admin,
                lambda c, active=active: c.post(
                    f"/api/v1/users/{teacher.public_id}/set-active",
                    {"is_active": active},
                    format="json",
                ),
            )
            == 1
        )
    # Deleted (an account that never did anything).
    unused = make_user(Role.TEACHER)
    assert run(admin, lambda c: c.delete(f"/api/v1/users/{unused.public_id}")) == 1
