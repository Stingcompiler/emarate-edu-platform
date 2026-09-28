"""Encrypted logical backups of the production database (docs/05 §12, Phase 11).

``pg_dump --format=custom`` (already compressed) → Fernet with a key derived
from ``BACKUP_ENCRYPTION_KEY`` → private storage under ``backups/``. The key is
separate from FIELD_ENCRYPTION_KEY and must also be kept offline (password
manager): without it no backup can be restored. Render's managed Postgres
backups remain the first line of recovery; these weekly dumps are the
off-platform copy.
"""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
from datetime import UTC, datetime

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

PREFIX = "backups"


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


def create(keep: int) -> str:
    """Dump, encrypt, upload; keep the newest ``keep`` backups. Returns the stored name."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    name = f"{PREFIX}/ecst-{stamp}.dump.enc"
    stored = default_storage.save(name, ContentFile(fernet().encrypt(dump())))
    prune(keep)
    return stored


def existing() -> list[str]:
    try:
        _, files = default_storage.listdir(PREFIX)
    except FileNotFoundError:
        return []
    return sorted(f"{PREFIX}/{f}" for f in files if f.endswith(".dump.enc"))


def prune(keep: int) -> list[str]:
    names = existing()
    stale = names[:-keep] if keep > 0 else []
    for name in stale:
        default_storage.delete(name)
    return stale


def decrypt(name: str) -> bytes:
    with default_storage.open(name, "rb") as handle:
        return fernet().decrypt(handle.read())
