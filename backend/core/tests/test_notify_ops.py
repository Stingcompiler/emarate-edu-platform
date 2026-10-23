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
    # In words an administrator reads (design review B5): the job, not the unit file's name; the
    # unit stays in the e-mail for whoever looks at the server, never a shell command.
    assert "النسخ الاحتياطي" in mail.outbox[0].subject
    assert "ecst-backup.service" in mail.outbox[0].body
    assert "journalctl" not in mail.outbox[0].body
    alert = Notification.objects.get(title__contains="النسخ الاحتياطي")
    assert alert.category == "ops" and "journalctl" not in alert.body
    assert "ecst-backup" not in alert.body

    call_command("notify_ops", unit="ecst-backup.service")  # within the hour: quiet
    assert len(mail.outbox) == 1
    call_command("notify_ops", unit="ecst-site-build.service")  # another unit: alerts
    assert len(mail.outbox) == 2
    assert admin.email in mail.outbox[1].to


def test_platform_alerts_are_for_system_admins_only(make_user, api):
    """The `ops` category never reaches the inbox or the preferences of anyone else."""
    from notifications import services
    from notifications.models import Category, Notification

    admin = make_user(Role.SYSTEM_ADMIN, email="admin@example.test")
    teacher = make_user(Role.TEACHER, email="teacher@example.test")
    # Even if one is addressed to someone else by mistake, it is not shown.
    alert = services.notify(
        [admin, teacher], category=Category.OPS, title="تنبيه", body="x", channels=["inapp"]
    )
    services.fan_out(alert)  # the worker's step, run here (on_commit does not fire in a test)
    assert Notification.objects.filter(category="ops").count() == 1

    seen = api(admin).get("/api/v1/notifications")
    assert [row["title"] for row in seen.data["results"]] == ["تنبيه"]
    assert api(teacher).get("/api/v1/notifications").data["results"] == []
    assert api(teacher).get("/api/v1/notifications/unread-count").data["count"] == 0

    admin_prefs = {
        row["category"] for row in api(admin).get("/api/v1/notifications/preferences").data
    }
    teacher_prefs = {
        row["category"] for row in api(teacher).get("/api/v1/notifications/preferences").data
    }
    assert "ops" in admin_prefs and "ops" not in teacher_prefs


def test_known_units_have_arabic_names_and_systemd_detail_is_translated():
    from core.management.commands.notify_ops import detail_ar, unit_label

    assert unit_label("ecst-disk-watch.service").startswith("مساحة القرص")
    assert unit_label("ecst-health") == "فحص صحة المنصة"
    assert unit_label("other.service") == "«other.service»"
    assert detail_ar("systemd reported the unit as failed") == "أبلغ النظام أن العملية فشلت."
    assert detail_ar("ecst-api is not active") == "ecst-api is not active"
