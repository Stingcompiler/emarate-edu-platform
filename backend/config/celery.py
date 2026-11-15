import logging
import os

from celery import Celery, Task
from celery.signals import worker_ready

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

logger = logging.getLogger(__name__)

# Never put off: the restore itself and the copies (they hold the backups' lock instead).
ALWAYS_RUN = frozenset({"core.tasks.restore_backup", "core.tasks.create_backup", "core.tasks.ping"})


class PlatformTask(Task):
    """While a backup is being restored (core.maintenance) a task is not run: it would write
    into rows being replaced under it (review 2026-11-15, R121). The scheduled ones come back
    on their own at the next beat; what was queued by a request belongs to rows the restore
    takes away. Tasks run inline (development, tests) always run."""

    def __call__(self, *args, **kwargs):
        if self.name not in ALWAYS_RUN and not self.request.is_eager:
            from core import maintenance

            closed = maintenance.check()
            if closed:
                logger.warning("task %s skipped: the platform is being restored", self.name)
                return None
        return super().__call__(*args, **kwargs)


app = Celery("ecst", task_cls=PlatformTask)
# All Celery options live in Django settings under the CELERY_ prefix.
# In development CELERY_TASK_ALWAYS_EAGER runs tasks inline, so no broker is needed.
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@worker_ready.connect
def _closed_after_a_restore(**kwargs):
    """A worker that starts while the platform is kept closed by a restore that could not end
    (its worker was stopped after the rows were replaced): tell the people who run it."""
    try:
        from core import maintenance

        found = maintenance.state() or {}
        if found.get("reason") != "restore-half":
            return
        from django.core.management import call_command

        call_command(
            "notify_ops",
            unit="ecst-restore.service",
            detail="المنصة مغلقة بعد استعادة لم تكتمل. راجع السجل ثم: manage.py maintenance --open",
        )
    except Exception:
        logger.exception("could not check the maintenance switch at start")
