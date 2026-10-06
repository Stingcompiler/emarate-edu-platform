"""Encrypted logical backups of the production database (docs/05 §12, Phase 11).

``pg_dump --format=custom`` (already compressed) → Fernet with a key derived
from ``BACKUP_ENCRYPTION_KEY`` → private storage under ``backups/``. The key is
separate from FIELD_ENCRYPTION_KEY and must also be kept offline (password
manager): without it no backup can be restored. Render's managed Postgres
backups remain the first line of recovery; these weekly dumps are the
off-platform copy.

When uploaded files live on the server's own disk (``MEDIA_BACKEND=local``, e.g. a single
VPS) they are archived beside each dump as ``ecst-media-<time>.tar.gz.enc`` — without them a
restored database points at submissions and images that no longer exist. On Bunny the files
already live off the server, so only the database is dumped.
"""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files import File
from django.core.files.storage import default_storage

PREFIX = "backups"
DB_SUFFIX = ".dump.enc"
MEDIA_SUFFIX = ".tar.gz.enc"


def fernet() -> Fernet:
    secret = getattr(settings, "BACKUP_ENCRYPTION_KEY", "")
    if not secret:
        raise ImproperlyConfigured("Set BACKUP_ENCRYPTION_KEY to create or read backups.")
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"ecst-backup", info=b"v1").derive(
        secret.encode()
    )
    return Fernet(base64.urlsafe_b64encode(key))


def _pg_env_and_args() -> tuple[dict, list[str]]:
    db = settings.DATABASES["default"]
    if "postgresql" not in db["ENGINE"]:
        raise ImproperlyConfigured("Backups need PostgreSQL (development runs on SQLite).")
    env = {**os.environ, "PGPASSWORD": db.get("PASSWORD") or ""}
    args = []
    if db.get("HOST"):
        args += ["--host", str(db["HOST"])]
    if db.get("PORT"):
        args += ["--port", str(db["PORT"])]
    if db.get("USER"):
        args += ["--username", str(db["USER"])]
    return env, [*args, str(db["NAME"])]


# Streamed format (review 2026-10-04 A14): the magic, then for each chunk of the plain file
# a 4-byte big-endian length and a Fernet token. Memory stays at one chunk whatever the size
# of the database or the uploaded files. Backups made before this (a single Fernet token)
# are still read by decrypt()/decrypt_to().
MAGIC = b"ECSTBAK1"
CHUNK = 8 * 1024 * 1024


def dump_to(path: Path) -> None:
    binary = shutil.which("pg_dump")
    if binary is None:
        raise ImproperlyConfigured("pg_dump is not installed on this machine.")
    env, args = _pg_env_and_args()
    result = subprocess.run(  # noqa: S603  (fixed binary, arguments from settings)
        [binary, "--format=custom", "--no-owner", "--no-privileges", f"--file={path}", *args],
        env=env,
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr.decode(errors='replace').strip()}")


def media_archive_to(path: Path) -> bool:
    """The uploaded files (public and private) as a .tar.gz at ``path``; False when they are
    not on this disk. The backups folder itself is left out."""
    if getattr(settings, "MEDIA_BACKEND", "local") != "local":
        return False
    root = Path(settings.MEDIA_ROOT).resolve()
    if not root.is_dir():
        return False
    with tarfile.open(path, mode="w:gz") as tar:
        for item in sorted(root.rglob("*")):
            relative = item.relative_to(root)
            if relative.parts[:2] == ("private", PREFIX) or not item.is_file():
                continue
            tar.add(item, arcname=str(relative))
    return True


def _encrypt_file(source: Path, target: Path, box: Fernet) -> None:
    with source.open("rb") as plain, target.open("wb") as sealed:
        sealed.write(MAGIC)
        while chunk := plain.read(CHUNK):
            token = box.encrypt(chunk)
            sealed.write(len(token).to_bytes(4, "big"))
            sealed.write(token)


def create(keep: int) -> list[str]:
    """Dump, encrypt, store (plus the uploaded files on a local disk); keep the newest ``keep``
    of each. Returns the stored names. Works through temporary files, chunk by chunk."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    box = fernet()
    stored = []
    with tempfile.TemporaryDirectory(prefix="ecst-backup-") as work:
        work = Path(work)
        parts = [(work / "db.dump", f"{PREFIX}/ecst-{stamp}{DB_SUFFIX}")]
        dump_to(parts[0][0])
        if media_archive_to(work / "media.tar.gz"):
            parts.append((work / "media.tar.gz", f"{PREFIX}/ecst-media-{stamp}{MEDIA_SUFFIX}"))
        for plain, name in parts:
            sealed = plain.with_suffix(plain.suffix + ".enc")
            _encrypt_file(plain, sealed, box)
            plain.unlink()
            with sealed.open("rb") as handle:
                stored.append(default_storage.save(name, File(handle)))
            sealed.unlink()
    prune(keep)
    return stored


def existing(suffix: str = DB_SUFFIX) -> list[str]:
    try:
        _, files = default_storage.listdir(PREFIX)
    except FileNotFoundError:
        return []
    return sorted(f"{PREFIX}/{f}" for f in files if f.endswith(suffix))


def prune(keep: int) -> list[str]:
    stale = []
    for suffix in (DB_SUFFIX, MEDIA_SUFFIX):
        names = existing(suffix)
        stale += names[:-keep] if keep > 0 else []
    for name in stale:
        default_storage.delete(name)
    return stale


def decrypt_to(name: str, out: Path) -> None:
    """Decrypt a stored backup to ``out``, chunk by chunk (or whole, for an older backup)."""
    box = fernet()
    with default_storage.open(name, "rb") as handle, Path(out).open("wb") as plain:
        head = handle.read(len(MAGIC))
        if head != MAGIC:  # a backup from before the streamed format
            plain.write(box.decrypt(head + handle.read()))
            return
        while size := handle.read(4):
            plain.write(box.decrypt(handle.read(int.from_bytes(size, "big"))))


def decrypt(name: str) -> bytes:
    with tempfile.TemporaryDirectory() as work:
        out = Path(work) / "plain"
        decrypt_to(name, out)
        return out.read_bytes()
