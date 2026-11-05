from celery import shared_task


@shared_task
def ping() -> str:
    """Smoke-test task: proves the Celery wiring works in every environment."""
    return "pong"


RUNNING = "backup-running"
LAST_ERROR = "backup-last-error"


@shared_task
def create_backup(actor_id: int | None = None) -> list[str]:
    """«إنشاء نسخة الآن» from the system admin's page: the same encrypted copy as the daily
    timer (core.backups.create), one at a time (the view holds RUNNING until this ends)."""
    import logging

    from django.conf import settings
    from django.core.cache import cache

    from audit.models import AuditLog
    from core import backups

    try:
        names = backups.create(getattr(settings, "BACKUP_KEEP", 8))
    except Exception:
        logging.getLogger(__name__).exception("backup requested from the portal failed")
        cache.set(LAST_ERROR, True, timeout=None)
        # The same alert as a failed daily backup: e-mail and in-app to the system admins.
        try:
            from django.core.management import call_command

            call_command(
                "notify_ops",
                unit="ecst-backup.service",
                detail="طُلبت من إعدادات النظام في البوابة.",
            )
        except Exception:
            logging.getLogger(__name__).exception("could not send the backup alert")
        return []
    finally:
        cache.delete(RUNNING)
    cache.delete(LAST_ERROR)
    AuditLog.objects.create(
        action="backup.create",
        actor_id=actor_id,
        target_type="backup",
        target_id=names[0],
        target_repr=" + ".join(names),
    )
    return names
