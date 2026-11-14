"""Restore a backup over the running platform, from the portal (owner, 2026-11-14).

What it promises:

- **Nothing is touched until the copy is known to be good.** It is decrypted whole (every
  record is authenticated and the end is sealed), read by the database's own tools, and
  refused when it was made by newer code than is running, or by the other database engine.
- **The state it replaces is kept.** With the platform closed (``core.maintenance``), a copy
  of that state is made first; it appears in the list, so a restore is undone by another.
- **The database is all or nothing.** On PostgreSQL every table is dropped and the copy loaded
  in one transaction (``psql --single-transaction``): an error, a stuck lock or a killed
  worker leaves the rows exactly as they were. On SQLite (development) the file is replaced
  by SQLite's online backup, which is one transaction too.
- **The uploaded files are swapped, not overwritten.** The copy's files are unpacked beside
  the live ones first; the live ones are moved to ``.replaced-<time>`` (kept a week) and the
  copy's moved in. The backups themselves are never part of it.
- Then the migrations run, so a copy from older code is brought up to the code that runs.

The copy is one the server kept, or — on an empty platform only — a file downloaded from
another installation and uploaded here with its password (``upload``): the way the platform
moves to another host.

It writes what it is doing to the cache (``STATE``) — not to the database it is replacing —
for the page to show when it opens again.
"""

from __future__ import annotations

import contextlib
import logging
import re
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.utils import timezone, translation
from django.utils.translation import gettext

from core import backups, maintenance

logger = logging.getLogger(__name__)

STATE = "restore-state"
_STATE_SECONDS = 30 * 24 * 3600
REPLACED_PREFIX = ".replaced-"
STAGING_PREFIX = ".restore-"
REPLACED_DAYS = 7


class RestoreRefused(Exception):
    """The copy cannot be restored here, and nothing was touched. ``code`` names why."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def state() -> dict | None:
    return cache.get(STATE)


def _say(**changes) -> None:
    cache.set(STATE, {**(cache.get(STATE) or {}), **changes}, timeout=_STATE_SECONDS)


def missing_tools() -> list[str]:
    """What the server lacks to restore (PostgreSQL's client programs)."""
    if backups.engine() != "postgresql":
        return []
    return [tool for tool in ("pg_dump", "pg_restore", "psql") if shutil.which(tool) is None]


# ─── Is the copy one this platform can take? ────────────────────────────────────────────


def _migrations_in_code() -> set[tuple[str, str]]:
    from django.db.migrations.loader import MigrationLoader

    return set(MigrationLoader(None, ignore_no_migrations=True).disk_migrations)


_COPY = re.compile(r"^COPY public\.django_migrations \(([^)]*)\) FROM stdin;$")


def _migrations_in_dump(dump: Path) -> set[tuple[str, str]]:
    if backups.engine() == "sqlite":
        connection = sqlite3.connect(f"{dump.as_uri()}?mode=ro", uri=True)
        try:
            return set(connection.execute("select app, name from django_migrations"))
        except sqlite3.DatabaseError:
            return set()
        finally:
            connection.close()
    result = subprocess.run(  # noqa: S603  (fixed binary, a path of our own)
        [shutil.which("pg_restore"), "--data-only", "--table=django_migrations", "--file=-", dump],
        check=False,
        capture_output=True,
    )
    found, columns = set(), None
    for line in result.stdout.decode(errors="replace").splitlines():
        if columns is None:
            header = _COPY.match(line)
            if header:
                columns = [name.strip() for name in header.group(1).split(",")]
            continue
        if line == "\\.":
            break
        row = dict(zip(columns, line.split("\t"), strict=False))
        found.add((row.get("app", ""), row.get("name", "")))
    return found


def check_dump(dump: Path) -> None:
    """RestoreRefused unless ``dump`` is a database copy this server and this code can load."""
    with dump.open("rb") as handle:
        head = handle.read(16)
    kind = (
        "sqlite"
        if head.startswith(b"SQLite format 3\x00")
        else "postgresql"
        if head.startswith(b"PGDMP")
        else None
    )
    if kind != backups.engine():
        raise RestoreRefused(
            "engine",
            gettext("This copy was made on another kind of database and cannot be restored here."),
        )
    if kind == "postgresql":
        listing = subprocess.run(  # noqa: S603
            [shutil.which("pg_restore"), "--list", dump], check=False, capture_output=True
        )
        if listing.returncode != 0:
            logger.error("pg_restore --list: %s", listing.stderr.decode(errors="replace").strip())
            raise RestoreRefused(
                "unreadable",
                gettext(
                    "The database tools on this server cannot read this copy; it was probably "
                    "made by a newer PostgreSQL."
                ),
            )
    applied = _migrations_in_dump(dump)
    if not applied:
        raise RestoreRefused("unreadable", gettext("This copy holds no database of the platform."))
    if applied - _migrations_in_code():
        raise RestoreRefused(
            "newer",
            gettext(
                "This copy was made by a newer version of the platform. Update the platform, "
                "then restore it."
            ),
        )


# ─── The database ───────────────────────────────────────────────────────────────────────

# Everything the application owns in the schema goes, in the same transaction that loads the
# copy: tables a later migration added would otherwise outlive the restore and break the
# migrations that follow. A lock held by anyone else for a minute fails the whole restore.
_EMPTY_THE_SCHEMA = """
SET lock_timeout = '60s';
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT c.relkind AS kind,
           quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm', 'f', 'r', 'p', 'S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
    ORDER BY position(c.relkind::text in 'vmfrpS')
  LOOP
    EXECUTE format(
      'DROP %s IF EXISTS %s CASCADE',
      CASE item.kind
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        WHEN 'S' THEN 'SEQUENCE'
        ELSE 'TABLE'
      END,
      item.name
    );
  END LOOP;
END $$;
SET lock_timeout = 0;
"""


def _postgres_restore(dump: Path, work: Path) -> None:
    script, empty = work / "restore.sql", work / "empty.sql"
    made = subprocess.run(  # noqa: S603
        [
            shutil.which("pg_restore"),
            "--no-owner",
            "--no-privileges",
            f"--file={script}",
            dump,
        ],
        check=False,
        capture_output=True,
    )
    if made.returncode != 0:
        raise RuntimeError(f"pg_restore: {made.stderr.decode(errors='replace').strip()}")
    empty.write_text(_EMPTY_THE_SCHEMA)
    env, target = backups._pg_env_and_args()
    loaded = subprocess.run(  # noqa: S603
        [
            shutil.which("psql"),
            "--no-psqlrc",
            "--quiet",
            "--single-transaction",
            "--set=ON_ERROR_STOP=1",
            "--output=/dev/null",
            f"--file={empty}",
            f"--file={script}",
            *target,
        ],
        env=env,
        check=False,
        capture_output=True,
    )
    if loaded.returncode != 0:
        raise RuntimeError(f"psql: {loaded.stderr.decode(errors='replace').strip()[-2000:]}")


def _sqlite_restore(dump: Path) -> None:
    source = sqlite3.connect(f"{dump.as_uri()}?mode=ro", uri=True)
    target = sqlite3.connect(str(settings.DATABASES["default"]["NAME"]), timeout=60)
    try:
        source.backup(target)
    finally:
        source.close()
        target.close()


def restore_database(dump: Path, work: Path) -> None:
    """Replace every row with the copy's, or change nothing."""
    from django.db import connections

    connections.close_all()  # this process holds no lock of its own on what is dropped
    if backups.engine() == "sqlite":
        _sqlite_restore(dump)
    else:
        _postgres_restore(dump, work)


# ─── The uploaded files ─────────────────────────────────────────────────────────────────


def media_root() -> Path | None:
    """Where the uploaded files live on this disk; None when they are stored elsewhere."""
    if getattr(settings, "MEDIA_BACKEND", "local") != "local":
        return None
    return Path(settings.MEDIA_ROOT)


def stage_files(archive: Path, root: Path) -> Path:
    """Unpack the copy's files beside the live ones (same disk, so the swap is a rename)."""
    root.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=STAGING_PREFIX, dir=root))
    (staging / "new").mkdir()
    with tarfile.open(archive, mode="r:gz") as tar:
        # "data": no absolute paths, no «..», no links out of the folder, no devices.
        tar.extractall(staging / "new", filter="data")
    return staging


def swap_files(staging: Path, root: Path) -> Path:
    """The live files step aside into ``.replaced-<time>`` and the copy's take their place.
    ``private/backups`` stays where it is: the backups are not part of any backup."""
    new, old = staging / "new", staging / "old"
    (old / "private").mkdir(parents=True)
    if (root / "public").exists():
        (root / "public").rename(old / "public")
    if (new / "public").exists():
        (new / "public").rename(root / "public")
    else:
        (root / "public").mkdir()
    (root / "private").mkdir(exist_ok=True)
    for child in list((root / "private").iterdir()):
        if child.name != backups.PREFIX:
            child.rename(old / "private" / child.name)
    if (new / "private").exists():
        for child in list((new / "private").iterdir()):
            if child.name != backups.PREFIX:
                child.rename(root / "private" / child.name)
    kept = root / f"{REPLACED_PREFIX}{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
    old.rename(kept)
    shutil.rmtree(staging, ignore_errors=True)
    return kept


def purge_replaced(root: Path | None = None, days: int = REPLACED_DAYS) -> list[str]:
    """Files a restore set aside more than a week ago, and what an interrupted one left."""
    root = root or media_root()
    if root is None or not root.is_dir():
        return []
    limit = datetime.now(UTC).timestamp() - days * 86400
    gone = []
    for folder in root.iterdir():
        stale = folder.name.startswith(REPLACED_PREFIX) and folder.stat().st_mtime < limit
        left = folder.name.startswith(STAGING_PREFIX) and folder.stat().st_mtime < limit
        if folder.is_dir() and (stale or left):
            shutil.rmtree(folder, ignore_errors=True)
            gone.append(folder.name)
    return gone


def upload_dir() -> Path:
    """Where a backup file brought from another installation waits, a chunk at a time: beside
    the backups (never part of a backup, never swapped by a restore), on this server's disk —
    the worker that restores it must see the same disk as the API that received it."""
    folder = Path(
        getattr(settings, "BACKUP_UPLOAD_DIR", "")
        or Path(settings.MEDIA_ROOT) / "private" / backups.PREFIX / "uploads"
    )
    folder.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(OSError):
        folder.chmod(0o700)
    return folder


def purge_uploads(hours: int = 24) -> None:
    """Uploads nobody finished: they hold a whole college and are not left lying."""
    limit = datetime.now(UTC).timestamp() - hours * 3600
    for path in upload_dir().glob("*.part"):
        with contextlib.suppress(OSError):
            if path.stat().st_mtime < limit:
                path.unlink()


# ─── The whole restore ──────────────────────────────────────────────────────────────────


def _fetch(stamp: str, work: Path, upload: Path | None, key: str | None):
    """The copy's two parts, decrypted into ``work``: from the server's own store, or from an
    uploaded file opened with the key its password made."""
    dump, archive = work / "database", work / "files.tar.gz"
    refused = RestoreRefused(
        "corrupt", gettext("This copy is incomplete or was changed. Choose an earlier one.")
    )
    if upload is not None:
        if not key:  # it waited too long for the worker: the key is gone from the cache
            raise refused
        try:
            with upload.open("rb") as handle:
                backups.read_package(handle, None, dump, archive, key=key)
        except (backups.BackupCorrupt, backups.WrongPassword, OSError):
            raise refused from None
        return dump, archive if archive.exists() else None
    names = backups.names_of(stamp)
    if not default_storage.exists(names["database"]):
        raise RestoreRefused("gone", gettext("This backup is no longer kept."))
    try:
        backups.decrypt_to(names["database"], dump)
        if default_storage.exists(names["files"]):
            backups.decrypt_to(names["files"], archive)
    except backups.BackupCorrupt:
        raise refused from None
    return dump, archive if archive.exists() else None


def _room_for(stamp: str, work: Path, upload: Path | None) -> None:
    """Refuse before starting when the disk cannot hold the copy unpacked — the database as
    the SQL it is loaded from, several times its compressed size — and a new copy of what is
    there now."""
    sizes = {"database": 0, "files": 0}
    if upload is not None:
        # Which part is which is not known before it is opened: count the file as both.
        sizes = {"database": upload.stat().st_size, "files": upload.stat().st_size}
    else:
        names = backups.names_of(stamp)
        for part in sizes:
            with contextlib.suppress(OSError, NotImplementedError):
                if default_storage.exists(names[part]):
                    sizes[part] = default_storage.size(names[part])
    spare = 64 * 1024 * 1024
    needs = [(work, sizes["database"] * 12 + sizes["files"] + spare)]
    root = media_root()
    if root is not None and root.is_dir():
        needs.append((root, sizes["database"] + sizes["files"] * 3 + spare))
    if any(shutil.disk_usage(place).free < needed for place, needed in needs):
        raise RestoreRefused(
            "space", gettext("There is not enough free disk space on the server to restore.")
        )


def _stamp_of(name: str) -> str:
    return name.rsplit("-", 1)[-1].split(".", 1)[0]


def _on_the_record(
    stamp: str, safety: str, actor_id: int | None, actor_email: str, source: str
) -> None:
    """The restored rows know nothing of their own restore: say it in them."""
    from accounts.models import User
    from audit.models import AuditLog
    from content.services import request_site_rebuild
    from notifications.services import notify_admins

    actor = User.objects.filter(pk=actor_id, email=actor_email).first() if actor_id else None
    AuditLog.objects.create(
        action="backup.restore",
        actor=actor,
        target_type="backup",
        target_id=stamp,
        target_repr=f"ecst-{stamp}",
        new={"by": actor_email, "kept_before": safety, "source": source},
    )
    notify_admins(
        "استُعيدت نسخة احتياطية",
        f"استعاد {actor.full_name_ar if actor else actor_email} نسخة {stamp}"
        f"{' من ملف مرفوع' if source == 'file' else ''}: المنصة الآن كما "
        f"كانت عند أخذها. الوضع الذي كان قبل الاستعادة محفوظ في نسخة {safety}.",
    )
    request_site_rebuild()


def run(
    stamp: str,
    actor_id: int | None = None,
    actor_email: str = "",
    *,
    upload: Path | None = None,
    key: str | None = None,
) -> dict:
    """Restore the kept copy ``stamp`` — or the uploaded file ``upload`` (whose own stamp is
    ``stamp``), opened with ``key``, on an empty platform. Returns the final state (also in
    the cache). The uploaded file is removed whatever the outcome: it holds a whole college."""
    from django.contrib.contenttypes.models import ContentType
    from django.core.management import call_command

    replaced = False
    staging = None
    with translation.override("ar"):
        _say(
            state="running",
            stamp=stamp,
            step="check",
            started=timezone.now().isoformat(),
            finished=None,
            error="",
            code="",
            kept_before=None,
            source="file" if upload is not None else "kept",
        )
        try:
            purge_replaced()
            if upload is not None and not backups.platform_is_empty():
                raise RestoreRefused(
                    "not_empty",
                    gettext(
                        "An uploaded backup file is restored only on a platform with no "
                        "students. Here, restore one of the server's own copies."
                    ),
                )
            with tempfile.TemporaryDirectory(prefix="ecst-restore-") as folder:
                work = Path(folder)
                _room_for(stamp, work, upload)
                dump, archive = _fetch(stamp, work, upload, key)
                check_dump(dump)
                root = media_root()
                if archive is not None and root is not None:
                    staging = stage_files(archive, root)
                with maintenance.held("restore"):
                    # Requests that were already inside finish first: what they write is in
                    # the copy of the present made next, not lost between it and the restore.
                    time.sleep(getattr(settings, "RESTORE_DRAIN_SECONDS", 3))
                    _say(step="safety")
                    safety = _stamp_of(backups.create(keep=0)[0])
                    _say(step="database", kept_before=safety)
                    restore_database(dump, work)
                    replaced = True
                    if staging is not None:
                        _say(step="files")
                        swap_files(staging, root)
                        staging = None
                    _say(step="upgrade")
                    call_command("migrate", interactive=False, verbosity=0)
                    ContentType.objects.clear_cache()
                    maintenance.new_epoch()
                    _on_the_record(
                        stamp, safety, actor_id, actor_email, "file" if upload else "kept"
                    )
            _say(state="done", step="", finished=timezone.now().isoformat())
        except RestoreRefused as refused:
            _say(
                state="failed",
                step="",
                error=str(refused),
                code=refused.code,
                finished=timezone.now().isoformat(),
            )
        except Exception:
            logger.exception("restoring backup %s failed", stamp)
            _say(
                state="failed",
                step="",
                code="half" if replaced else "error",
                error=(
                    gettext(
                        "The database was restored, but a later step failed. The state before "
                        "the restore is kept in the newest backup; see the server's log."
                    )
                    if replaced
                    else gettext(
                        "The restore failed and nothing was changed. Details are in the "
                        "server's log."
                    )
                ),
                finished=timezone.now().isoformat(),
            )
        finally:
            if staging is not None:
                shutil.rmtree(staging, ignore_errors=True)
            if upload is not None:
                upload.unlink(missing_ok=True)
    return state() or {}
