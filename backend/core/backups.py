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
import io
import os
import shutil
import subprocess
import tarfile
from datetime import UTC, datetime
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
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


def dump() -> bytes:
    binary = shutil.which("pg_dump")
    if binary is None:
        raise ImproperlyConfigured("pg_dump is not installed on this machine.")
    env, args = _pg_env_and_args()
    result = subprocess.run(  # noqa: S603  (fixed binary, arguments from settings)
        [binary, "--format=custom", "--no-owner", "--no-privileges", *args],
        env=env,
        check=False,
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr.decode(errors='replace').strip()}")
    return result.stdout


def media_archive() -> bytes | None:
    """The uploaded files (public and private) as a .tar.gz, or None when they are not on this
    disk. The backups folder itself is left out."""
    if getattr(settings, "MEDIA_BACKEND", "local") != "local":
        return None
    root = Path(settings.MEDIA_ROOT).resolve()
    if not root.is_dir():
        return None
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for path in sorted(root.rglob("*")):
            relative = path.relative_to(root)
            if relative.parts[:2] == ("private", PREFIX) or not path.is_file():
                continue
            tar.add(path, arcname=str(relative))
    return buffer.getvalue()


def create(keep: int) -> list[str]:
    """Dump, encrypt, store (plus the uploaded files on a local disk); keep the newest ``keep``
    of each. Returns the stored names."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    box = fernet()
    stored = [
        default_storage.save(f"{PREFIX}/ecst-{stamp}{DB_SUFFIX}", ContentFile(box.encrypt(dump())))
    ]
    media = media_archive()
    if media is not None:
        stored.append(
            default_storage.save(
                f"{PREFIX}/ecst-media-{stamp}{MEDIA_SUFFIX}", ContentFile(box.encrypt(media))
            )
        )
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


def decrypt(name: str) -> bytes:
    with default_storage.open(name, "rb") as handle:
        return fernet().decrypt(handle.read())
