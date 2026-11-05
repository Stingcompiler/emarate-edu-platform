"""Deleting announcements and sent notifications by request (owner, 2026-11-05): the author
keeps their history and asks; the system admin or the system supervisor decides; the system
admin and the site manager delete at once; the system supervisor never deletes on their own."""

from datetime import timedelta

from django.utils import timezone

from accounts.rbac import Role
from audit.models import AuditLog
from content.models import Announcement, DeletionRequest, Status
from notifications.models import Notification

A = "/api/v1/announcements"
R = "/api/v1/deletion-requests"


def _announcement(author, audience="all_internal"):
    return Announcement.objects.create(
        scope="college",
        audience=audience,
        title="إعلان قديم",
        body="<p>نص</p>",
        status=Status.PUBLISHED,
        publish_at=timezone.now() - timedelta(hours=1),
        created_by=author,
    )


def test_an_author_asks_and_the_supervisor_approves(api, make_user):
    author = make_user(Role.ACADEMIC_AFFAIRS)
    supervisor = make_user(Role.SYSTEM_SUPERVISOR)
    item = _announcement(author, audience="staff")
    asked = api(author).delete(f"{A}/{item.public_id}", {"reason": "مكرر"}, format="json")
    assert asked.status_code == 202 and asked.data["state"] == "pending"
    mine = api(author).get(A).data["results"]
    assert any(a["public_id"] == str(item.public_id) and a["deletion_pending"] for a in mine)
    # The approvers hear of it; the author does not decide.
    assert Notification.objects.filter(title__startswith="طلب حذف").exists()
    req = DeletionRequest.objects.get()
    assert api(author).post(f"{R}/{req.pk}/approve").status_code == 403
    listed = api(supervisor).get(f"{R}?state=pending").data["results"]
    assert [r["title"] for r in listed] == ["إعلان قديم"] and listed[0]["reason"] == "مكرر"
    done = api(supervisor).post(f"{R}/{req.pk}/approve", {"note": "تم"}, format="json")
    assert done.status_code == 200 and done.data["state"] == "approved"
    assert not Announcement.objects.filter(pk=item.pk).exists()
    assert AuditLog.objects.filter(action="deletion.approve", actor=supervisor).exists()
    assert AuditLog.objects.filter(action="announcement.delete", actor=supervisor).exists()
    again = api(supervisor).post(f"{R}/{req.pk}/reject")
    assert again.status_code == 409 and again.data["code"] == "decided"


def test_a_rejected_request_keeps_the_announcement(api, make_user):
    author = make_user(Role.ACADEMIC_AFFAIRS)
    admin = make_user(Role.SYSTEM_ADMIN)
    item = _announcement(author, audience="staff")
    api(author).delete(f"{A}/{item.public_id}")
    req = DeletionRequest.objects.get()
    assert api(admin).post(f"{R}/{req.pk}/reject", {"note": "ما زال مطلوبًا"}).status_code == 200
    assert Announcement.objects.filter(pk=item.pk).exists()
    assert Notification.objects.filter(title__startswith="لم يُوافَق").exists()


def test_the_admin_and_the_site_manager_delete_at_once(api, make_user):
    admin, site = make_user(Role.SYSTEM_ADMIN), make_user(Role.SITE_MANAGER)
    first, second = _announcement(admin), _announcement(site)
    assert api(admin).delete(f"{A}/{first.public_id}").status_code == 204
    assert api(site).delete(f"{A}/{second.public_id}").status_code == 204
    assert not DeletionRequest.objects.exists()


def test_the_system_supervisor_never_deletes(api, make_user, it_dept):
    supervisor = make_user(Role.SYSTEM_SUPERVISOR)
    own = _announcement(supervisor)
    assert api(supervisor).delete(f"{A}/{own.public_id}").status_code == 202  # asks too
    # Nothing that deletes: a user, a department, a role assignment.
    victim = make_user(Role.TEACHER)
    assert api(supervisor).delete(f"/api/v1/users/{victim.public_id}").status_code == 403
    assert api(supervisor).delete(f"/api/v1/departments/{it_dept.pk}").status_code == 403
    # It stands in for the admin otherwise, but never over an admin's account.
    admin = make_user(Role.SYSTEM_ADMIN)
    assert api(supervisor).get("/api/v1/system-settings").status_code == 200
    assert (
        api(supervisor).post(f"/api/v1/users/{admin.public_id}/reset-password").status_code == 403
    )
    granted = api(supervisor).post(
        "/api/v1/role-assignments",
        {"user": str(victim.public_id), "role": "system_admin"},
        format="json",
    )
    assert granted.status_code == 403


def test_a_sent_notification_is_kept_and_deleted_by_request(api, make_user):
    sender = make_user(Role.STUDENT_AFFAIRS)
    supervisor = make_user(Role.SYSTEM_SUPERVISOR)
    note = Notification.objects.create(category="college", title="تنبيه", sender=sender)
    sent = api(sender).get("/api/v1/notifications/sent").data["results"]
    assert [n["public_id"] for n in sent] == [str(note.public_id)]
    asked = api(sender).delete(f"/api/v1/notifications/sent/{note.public_id}")
    assert asked.status_code == 202
    other = make_user(Role.STUDENT_AFFAIRS)
    assert api(other).delete(f"/api/v1/notifications/sent/{note.public_id}").status_code == 404
    req = DeletionRequest.objects.get(kind="notification")
    assert api(supervisor).post(f"{R}/{req.pk}/approve").status_code == 200
    assert not Notification.objects.filter(pk=note.pk).exists()


def test_a_sender_hides_a_notification_at_once_and_restores_it(api, make_user):
    """Soft deletion (owner, 2026-11-05): gone from every inbox now, kept and restorable."""
    from notifications.models import NotificationRecipient

    sender, reader, stranger = (
        make_user(Role.STUDENT_AFFAIRS),
        make_user(Role.STUDENT),
        make_user(Role.STUDENT_AFFAIRS),
    )
    note = Notification.objects.create(category="college", title="تنبيه", sender=sender)
    NotificationRecipient.objects.create(notification=note, user=reader)
    url = f"/api/v1/notifications/sent/{note.public_id}"
    assert api(reader).get("/api/v1/notifications/unread-count").data["count"] == 1
    assert api(stranger).post(f"{url}/hide").status_code == 404
    hidden = api(sender).post(f"{url}/hide")
    assert hidden.status_code == 200 and hidden.data["hidden_at"]
    assert api(reader).get("/api/v1/notifications").data["results"] == []
    assert api(reader).get("/api/v1/notifications/unread-count").data["count"] == 0
    assert AuditLog.objects.filter(action="notification.hide", actor=sender).exists()
    # Still in the sender's «المرسلة», and back on restoring.
    assert api(sender).get("/api/v1/notifications/sent").data["results"][0]["hidden_at"]
    assert api(sender).post(f"{url}/restore").data["hidden_at"] is None
    assert api(reader).get("/api/v1/notifications/unread-count").data["count"] == 1
