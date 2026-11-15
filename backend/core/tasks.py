from celery import shared_task


@shared_task
def ping() -> str:
    """Smoke-test task: proves the Celery wiring works in every environment."""
    return "pong"


RUNNING = "backup-running"  # the backups' lock: core.backups.LOCK (holding)
LAST_ERROR = "backup-last-error"


@shared_task
def create_backup(actor_id: int | None = None, lock: str | None = None) -> list[str]:
    """«إنشاء نسخة الآن» from the system admin's page: the same encrypted copy as the daily
    timer (core.backups.create), one at a time — under the lock the page took (``lock``),
    renewed while the copy is made and let go when it ends."""
    import logging

    from django.conf import settings
    from django.core.cache import cache

    from audit.models import AuditLog
    from core import backups

    try:
        with backups.holding("create", lock):
            names = backups.create(getattr(settings, "BACKUP_KEEP", 8))
    except backups.Busy:
        logging.getLogger(__name__).warning("backup asked from the portal: the lock is taken")
        return []
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
    lock: str | None = None,
) -> dict:
    """«استعادة» from the system admin's page (core.restore.run): one at a time, and never
    beside a copy being made — under the lock the page took (``lock``), held until the end.
    A failure tells the people who run the platform, like a failed backup."""
    import logging

    from core import backups, restore

    try:
        with backups.holding("restore", lock):
            result = _restore(stamp, actor_id, actor_email, upload, key_handle)
    except backups.Busy:
        # The page's lock ran out before the worker came to it, and someone else took it.
        if upload:
            from pathlib import Path

            from django.core.cache import cache

            Path(upload).unlink(missing_ok=True)  # it holds a whole college
            if key_handle:
                cache.delete(key_handle)
        result = restore.interrupted(stamp)
    if result.get("state") == "failed" and result.get("code") in ("half", "rolled_back", "error"):
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


def _restore(stamp, actor_id, actor_email, upload, key_handle) -> dict:
    from django.core.cache import cache

    from core import restore

    if not upload:
        return restore.run(stamp, actor_id, actor_email)
    # The key its password made waited in the cache, not in the task's arguments.
    from pathlib import Path

    key = cache.get(key_handle) if key_handle else None
    if key_handle:
        cache.delete(key_handle)
    return restore.run(stamp, actor_id, actor_email, upload=Path(upload), key=key)
