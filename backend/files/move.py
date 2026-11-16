"""Copying the server's uploaded files to Bunny (owner, 2026-11-16: «ننقل التخزين إلى bunny، كل
الملفات كتخزين دائم»).

``MEDIA_ROOT/private`` goes to the private zone and ``MEDIA_ROOT/public`` to the public one, under
the same names, so every row that points at a file keeps pointing at it. The backups
(``private/backups``) and what a restore set aside (``.replaced-…``) stay on the server. A file
already there with the same size is not sent again, so the move can run any number of times:
once before the switch, once after it (for what was uploaded in between), and by a restore
that brings back a copy's files. Nothing is deleted from the server's disk here.
"""

from __future__ import annotations

import tarfile
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files import File

PARTS = ("private", "public")


def zones() -> dict:
    """The two zones, from the settings — set even while the files are still local."""
    from .bunny import BunnyStorage

    needed = (
        "BUNNY_STORAGE_ZONE",
        "BUNNY_STORAGE_KEY",
        "BUNNY_PUBLIC_STORAGE_ZONE",
        "BUNNY_PUBLIC_STORAGE_KEY",
    )
    missing = [name for name in needed if not getattr(settings, name, "")]
    if missing:
        raise ImproperlyConfigured(f"Bunny storage is not set up: {', '.join(missing)}.")
    return {
        "private": BunnyStorage(),
        "public": BunnyStorage(
            zone=settings.BUNNY_PUBLIC_STORAGE_ZONE,
            key=settings.BUNNY_PUBLIC_STORAGE_KEY,
            base_url=settings.BUNNY_PUBLIC_URL,
        ),
    }


def local_files(root: Path, part: str) -> Iterator[tuple[str, Path]]:
    """(name in the zone, path on disk) of every file of ``part`` that belongs on Bunny."""
    folder = root / part
    if not folder.is_dir():
        return
    from core.backups import is_upload

    for item in sorted(folder.rglob("*")):
        if not item.is_file() or item.is_symlink():
            continue
        relative = item.relative_to(folder)
        if is_upload(Path(part) / relative):
            yield relative.as_posix(), item


def move(
    root: Path | None = None,
    *,
    dry_run: bool = False,
    say: Callable[[str], None] = lambda line: None,
) -> dict:
    """Send what is missing; then check that every file is there with its size."""
    root = Path(root or settings.MEDIA_ROOT)
    found = {"files": 0, "sent": 0, "already": 0, "bytes": 0, "failed": [], "missing": []}
    for part, storage in zones().items():
        there = storage.inventory()
        mine = list(local_files(root, part))
        for name, path in mine:
            found["files"] += 1
            size = path.stat().st_size
            if there.get(name) == size:
                found["already"] += 1
                continue
            found["bytes"] += size
            if dry_run:
                found["sent"] += 1
                continue
            try:
                with path.open("rb") as handle:
                    storage._save(name, File(handle, name=name))  # the same name, as is
                found["sent"] += 1
            except Exception as error:
                found["failed"].append(f"{part}/{name}: {type(error).__name__}")
            if found["sent"] and found["sent"] % 200 == 0:
                say(f"{found['sent']} sent…")
        if not dry_run:
            there = storage.inventory()
            found["missing"] += [
                f"{part}/{name}" for name, path in mine if there.get(name) != path.stat().st_size
            ]
    return found


def push_archive(archive: Path) -> dict:
    """A copy's files (a backup made while they were on this disk), sent to Bunny: what a
    restore does once the files live there."""
    from core.restore import _files_only

    # Unpacked beside the files, not in the system's temporary folder (often small): a dot
    # folder, which neither the backups nor the move take for uploaded files.
    media = Path(settings.MEDIA_ROOT)
    media.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".restore-files-", dir=media) as folder:
        with tarfile.open(archive, mode="r:gz") as tar:
            tar.extractall(folder, filter=_files_only)  # noqa: S202  (the "data" filter, no links)
        return move(Path(folder))
