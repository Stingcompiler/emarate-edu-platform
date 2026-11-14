"""Maintenance: the platform answers «try again in a few minutes» while a backup is being
restored (owner, 2026-11-14), because every table is replaced under the requests' feet.

The switch lives in the cache, not in the database that is being replaced. It ends by itself
soon after its keeper stops renewing it (``held``), so a worker killed in the middle of a
restore never leaves the platform closed.
"""

from __future__ import annotations

import contextlib
import threading
from contextlib import contextmanager

from django.core.cache import cache
from django.utils import timezone

KEY = "maintenance"
# Bumped after a restore: each server process then drops what it remembers of the old rows.
EPOCH = "restore-epoch"
SECONDS = 180
BEAT = 30


def state() -> dict | None:
    return cache.get(KEY)


def begin(reason: str) -> None:
    cache.set(KEY, {"reason": reason, "since": timezone.now().isoformat()}, timeout=SECONDS)


def end() -> None:
    cache.delete(KEY)


@contextmanager
def held(reason: str):
    """Maintenance for as long as the block runs, renewed every half minute."""
    begin(reason)
    opened = state() or {"reason": reason}
    stop = threading.Event()

    def renew():
        while not stop.wait(BEAT):
            # A cache that hiccups once must not open the platform in the middle of a restore.
            with contextlib.suppress(Exception):
                cache.set(KEY, opened, timeout=SECONDS)

    keeper = threading.Thread(target=renew, daemon=True)
    keeper.start()
    try:
        yield
    finally:
        stop.set()
        keeper.join(timeout=5)
        end()


def new_epoch() -> None:
    cache.set(EPOCH, timezone.now().isoformat(), timeout=None)


_seen_epoch = None


def check() -> dict | None:
    """Called on each request: is the platform closed? On the way, after a restore, this
    process forgets the content types it cached (their ids may differ in the restored rows)."""
    global _seen_epoch
    try:
        found = cache.get_many([KEY, EPOCH])
    except Exception:  # the cache is down: that is the health check's to report, not a closure
        return None
    epoch = found.get(EPOCH)
    if epoch != _seen_epoch:
        from django.contrib.contenttypes.models import ContentType

        ContentType.objects.clear_cache()
        _seen_epoch = epoch
    return found.get(KEY)
