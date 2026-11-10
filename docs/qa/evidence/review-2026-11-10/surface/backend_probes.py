"""QA probes, review 2026-11-10 axes 1.4 (soft-deleted notifications) and 1.5 (staff on the
site). Each test EXPECTS THE FAULTY BEHAVIOUR: a pass means the defect is reproduced."""

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
import io

from accounts.rbac import Role
from content.models import MediaAsset, StaffEntry, StaffGroup, StaffPlacement
from notifications import push, tasks
from notifications.models import Notification, Outbox, PushSubscription


# ─── R81: a push queued before the sender hid the notification is still sent ──────────────


def test_probe_r81_a_hidden_notification_is_still_pushed(make_user, monkeypatch):
    """«حذف» in «المرسلة» hides the notification from every inbox at once; the push already
    queued for it (a busy worker, a retry) is delivered all the same: the recipients are told
    about something that is gone. (The email waiting in the outbox went too: it had no link to
    its notification to check.)"""
    sender = make_user(Role.ACADEMIC_AFFAIRS)
    teacher = make_user(Role.TEACHER)
    note = Notification.objects.create(sender=sender, title="تنبيه", body="نص", category="college")
    subscription = PushSubscription.objects.create(
        user=teacher, endpoint="https://push.example/1", p256dh="k", auth="a"
    )
    from django.utils import timezone

    note.hidden_at = timezone.now()
    note.save(update_fields=["hidden_at"])
    sent = []
    monkeypatch.setattr(push, "send", lambda sub, payload: sent.append(payload) or True)
    assert tasks.send_push(subscription.pk, note.pk) is True
    assert len(sent) == 1


# ─── R82: a picture shown on «الكوادر» is deleted without a word ──────────────────────────


def test_probe_r82_a_staff_photo_is_deleted_from_the_library(api, make_user):
    """The library refuses to delete the site's logo or share image (in use); a picture that
    is a person's photo on «الكوادر» goes, and the card falls back to initials silently."""
    manager = make_user(Role.SITE_MANAGER)
    out = io.BytesIO()
    Image.new("RGB", (300, 300), (10, 20, 30)).save(out, "PNG")
    asset = MediaAsset.objects.create(
        file=SimpleUploadedFile("dean.png", out.getvalue(), "image/png"),
        alt_ar="العميد",
        uploaded_by=manager,
    )
    entry = StaffEntry.objects.create(name_ar="أ.د. عمر", photo=asset)
    StaffPlacement.objects.create(entry=entry, group=StaffGroup.objects.first())
    gone = api(manager).delete(f"/api/v1/content/media/{asset.public_id}")
    assert gone.status_code == 204
    entry.refresh_from_db()
    assert entry.photo_id is None
