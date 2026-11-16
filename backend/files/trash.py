"""Removing an uploaded file once no row points at it (review 2026-11-16).

On the server's disk the file goes at once: every backup carries the files beside the database,
so a restored copy brings it back. On Bunny the backups hold the database only (the files already
live off the server), so a deleted file waits ``FILES_KEEP_DELETED_DAYS`` — as long as the copies
are kept off the server — before it leaves the zone; until then a restored copy still finds every
file it points at. ``purge`` (a daily task) removes what is due.
"""

from __future__ import annotations

import logging
import urllib.error
from datetime import timedelta

from django.conf import settings
from django.core.files.storage import storages
from django.utils import timezone

logger = logging.getLogger(__name__)


def _on_bunny() -> bool:
    return getattr(settings, "MEDIA_BACKEND", "local") == "bunny"


def _delete_now(storage: str, name: str) -> bool:
    try:
        storages[storage].delete(name)
    except urllib.error.HTTPError as error:
        if error.code != 404:  # already gone is gone
            logger.warning("could not remove the file %s (HTTP %s)", name, error.code)
            return False
    except Exception:
        logger.warning("could not remove the file %s", name)
        return False
    return True


def discard(names, storage: str = "default") -> None:
    """``names`` (one or many) are no longer used by any row."""
    from .models import DiscardedFile

    names = [names] if isinstance(names, str) else [n for n in names if n]
    if not names:
        return
    if not _on_bunny():
        for name in names:
            _delete_now(storage, name)
        return
    due = timezone.now() + timedelta(days=settings.FILES_KEEP_DELETED_DAYS)
    DiscardedFile.objects.bulk_create(
        [DiscardedFile(storage=storage, name=name[:255], due=due) for name in names]
    )


def purge(limit: int = 2000) -> dict:
    """Remove from Bunny what has waited long enough; what fails waits for the next run."""
    from .models import DiscardedFile

    removed = failed = 0
    for item in DiscardedFile.objects.filter(due__lte=timezone.now())[:limit]:
        if _delete_now(item.storage, item.name):
            item.delete()
            removed += 1
        else:
            failed += 1
    return {"removed": removed, "failed": failed}
