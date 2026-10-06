from django.core import mail
from django.core.management import call_command

from accounts.rbac import Role
from notifications.models import Notification


def test_a_failure_reaches_the_admins_once_an_hour(make_user, settings, tmp_path, monkeypatch):
    """Review 2026-10-04 A9: a failed backup went unnoticed for a day."""
    import tempfile

    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))
    settings.OPS_ALERT_EMAIL = "ops@example.test"
    admin = make_user(Role.SYSTEM_ADMIN, email="admin@example.test")
    make_user(Role.TEACHER, email="teacher@example.test")

    call_command("notify_ops", unit="ecst-backup.service", detail="pg_dump exited 1")
    assert len(mail.outbox) == 1
    assert sorted(mail.outbox[0].to) == ["admin@example.test", "ops@example.test"]
    assert "ecst-backup.service" in mail.outbox[0].subject
    assert Notification.objects.filter(title__contains="ecst-backup.service").count() == 1

    call_command("notify_ops", unit="ecst-backup.service")  # within the hour: quiet
    assert len(mail.outbox) == 1
    call_command("notify_ops", unit="ecst-site-build.service")  # another unit: alerts
    assert len(mail.outbox) == 2
    assert admin.email in mail.outbox[1].to
