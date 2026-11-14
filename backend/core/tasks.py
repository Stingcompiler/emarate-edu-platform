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


@shared_task
def restore_backup(
    stamp: str,
    actor_id: int | None = None,
    actor_email: str = "",
    upload: str | None = None,
    key_handle: str | None = None,
) -> dict:
    """«استعادة» from the system admin's page (core.restore.run): one at a time, and never
    beside a copy being made — the view holds RUNNING until this ends. A failure tells the
    people who run the platform, like a failed backup."""
    import logging

    from django.core.cache import cache

    from core import restore

    try:
        if upload:
            # The key its password made waited in the cache, not in the task's arguments.
            from pathlib import Path

            key = cache.get(key_handle) if key_handle else None
            if key_handle:
                cache.delete(key_handle)
            result = restore.run(stamp, actor_id, actor_email, upload=Path(upload), key=key)
        else:
            result = restore.run(stamp, actor_id, actor_email)
    finally:
        cache.delete(RUNNING)
    if result.get("state") == "failed" and result.get("code") in ("half", "error"):
        try:
            from django.core.management import call_command

            call_command(
                "notify_ops",
                unit="ecst-restore.service",
                detail=f"استعادة نسخة {stamp} من إعدادات النظام: {result.get('error', '')}",
            )
        except Exception:
            logging.getLogger(__name__).exception("could not send the restore alert")
    return result
