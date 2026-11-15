"""Maintenance: the platform answers «try again in a few minutes» while a backup is being
restored (owner, 2026-11-14), because every table is replaced under the requests' feet.

The switch lives in the cache, not in the database that is being replaced. It ends by itself
soon after its keeper stops renewing it (``held``), so a worker killed while the copy is being
checked or loaded (all or nothing) never leaves the platform closed. Once the rows have been
replaced it is no longer so: a restore that cannot finish, nor put back what was there, keeps
the platform closed until whoever runs the server opens it (``stay_closed``; review
2026-11-15, R120) — open, it would serve rows and files that do not belong together.

Requests that write are counted while they run (``writing``), so a restore waits for those
already inside instead of a fixed few seconds (R121).
"""

from __future__ import annotations

import contextlib
import threading
from contextlib import contextmanager

from django.core.cache import cache
from django.utils import timezone

KEY = "maintenance"
WRITES = "maintenance-writes"
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


def stay_closed(reason: str) -> None:
    """Closed until ``manage.py maintenance --open``: nothing renews it, nothing ends it."""
    cache.set(KEY, {"reason": reason, "since": timezone.now().isoformat()}, timeout=None)


class _Hold:
    def __init__(self):
        self.kept = False

    def keep_closed(self, reason: str) -> None:
        """When the block ends, the platform stays closed (``stay_closed``)."""
        self.kept = True
        stay_closed(reason)

    def reopen(self) -> None:
        """It may open again when the block ends, after all."""
        self.kept = False


@contextmanager
def held(reason: str):
    """Maintenance for as long as the block runs, renewed every half minute."""
    begin(reason)
    opened = state() or {"reason": reason}
    stop = threading.Event()
    hold = _Hold()

    def renew():
        while not stop.wait(BEAT):
            if hold.kept:
                return
            # A cache that hiccups once must not open the platform in the middle of a restore.
            with contextlib.suppress(Exception):
                cache.set(KEY, opened, timeout=SECONDS)

    keeper = threading.Thread(target=renew, daemon=True)
    keeper.start()
    try:
        yield hold
    finally:
        stop.set()
        keeper.join(timeout=5)
        if not hold.kept:
            end()


# ─── The writes in flight ───────────────────────────────────────────────────────────────


def writing() -> None:
    """A request that may write has come in (counted before it looks at the switch, so one
    that saw it open is always counted when the restore starts waiting)."""
    with contextlib.suppress(Exception):
        cache.add(WRITES, 0, timeout=None)
        cache.incr(WRITES)


def written() -> None:
    with contextlib.suppress(Exception):
        if cache.decr(WRITES) < 0:  # one that was running when the count started again
            cache.set(WRITES, 0, timeout=None)


def drain(seconds: float, poll: float = 0.2) -> int:
    """Wait until no request that writes is still running, ``seconds`` at most; then start
    the count again (a process killed in the middle of a request never decremented). Returns
    how many were still running when it stopped waiting."""
    import time

    deadline = time.monotonic() + seconds
    left = 0
    while True:
        try:
            left = int(cache.get(WRITES) or 0)
        except Exception:
            left = 0
        if left <= 0 or time.monotonic() >= deadline:
            break
        time.sleep(poll)
    if left:
        with contextlib.suppress(Exception):
            cache.set(WRITES, 0, timeout=None)
    return max(left, 0)


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

        from accounts import services

        ContentType.objects.clear_cache()
        services.forget_session_epoch()  # read again from the restored rows
        _seen_epoch = epoch
    return found.get(KEY)
