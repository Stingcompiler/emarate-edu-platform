"""Deletion paths outside the matrix rows (roles review 2026-11-06), with the owner's
decisions: the supervisor deletes nothing and approves no request of its own."""

import pytest

from accounts.models import RoleAssignment, StaffLink
from accounts.rbac import Role
from content.models import Announcement, DeletionRequest
from content.tests.test_deletion_requests import _announcement


@pytest.mark.parametrize("role", Role)
def test_observed_removal_of_own_preexisting_link(role, users, api):
    actor = users[role]
    link = StaffLink.objects.create(user=actor, label="Legacy", url="https://example.org/")
    response = api(actor).delete(f"/api/v1/me/links/{link.pk}")
    assert response.status_code == 204
    assert not StaffLink.objects.filter(pk=link.pk).exists()


def test_the_supervisor_cannot_approve_its_own_deletion_request(users, api):
    """Owner, 2026-11-06 (roles review): approving its own request was deleting by itself."""
    actor = users[Role.SYSTEM_SUPERVISOR]
    item = _announcement(actor)
    client = api(actor)
    asked = client.delete(f"/api/v1/announcements/{item.public_id}")
    assert asked.status_code == 202
    request = DeletionRequest.objects.get(requested_by=actor)
    assert client.post(f"/api/v1/deletion-requests/{request.pk}/approve").status_code == 403
    request.refresh_from_db()
    assert request.state == DeletionRequest.State.PENDING and request.decided_by_id is None
    assert Announcement.objects.filter(pk=item.pk).exists()
    # Another approver decides it.
    approved = api(users[Role.SYSTEM_ADMIN]).post(f"/api/v1/deletion-requests/{request.pk}/approve")
    assert approved.status_code == 200
    assert not Announcement.objects.filter(pk=item.pk).exists()


def test_observed_supervisor_can_revoke_teacher_role(users, api):
    assignment = RoleAssignment.objects.get(user=users[Role.TEACHER], role=Role.TEACHER)
    response = api(users[Role.SYSTEM_SUPERVISOR]).delete(
        f"/api/v1/role-assignments/{assignment.pk}"
    )
    assert response.status_code == 204
    assert not RoleAssignment.objects.filter(pk=assignment.pk).exists()


@pytest.mark.parametrize("role", Role)
def test_observed_draft_regulation_deletion(role, users, api):
    from student_affairs.models import Regulation

    draft = Regulation.objects.create(title="Audit draft", created_by=users[Role.SYSTEM_ADMIN])
    response = api(users[role]).delete(f"/api/v1/regulations/{draft.public_id}")
    # The system supervisor deletes nothing (owner, 2026-11-05), drafts included.
    allowed = role in {Role.SYSTEM_ADMIN, Role.STUDENT_AFFAIRS}
    if allowed:
        assert response.status_code == 204
        assert not Regulation.objects.filter(pk=draft.pk).exists()
    else:
        assert response.status_code in (403, 404)
        draft.refresh_from_db()
        assert draft.title == "Audit draft"
        assert draft.status == Regulation.Status.DRAFT
