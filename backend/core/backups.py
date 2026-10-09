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

from cryptography.fernet import Fernet, InvalidToken
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


# Streamed format (review 2026-10-04 A14; sealed end, review 2026-10-08 R07): MAGIC, then
# records of a 4-byte big-endian length and a Fernet token. Each token's plain text starts
# with the file's random id (16 bytes), the record's number (8 bytes) and its kind: b"D"
# carries up to CHUNK bytes of the file, the single last b"E" carries the total byte count.
# Fernet authenticates every record, so a record dropped, moved, taken from another backup
# or cut off at the end, or a missing end record, is an error, never a shorter restore.
# Memory stays at one chunk whatever the size of the database or the uploaded files.
# Older backups (ECSTBAK1 records without numbers, or a single Fernet token) are still read.
MAGIC = b"ECSTBAK2"
MAGIC_V1 = b"ECSTBAK1"
CHUNK = 8 * 1024 * 1024
_HEAD = 16 + 8 + 1


class BackupCorrupt(Exception):
    """The stored backup is incomplete or was changed; nothing from it can be trusted."""


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
    file_id = os.urandom(16)
    number = 0
    total = 0

    def put(sealed, kind: bytes, payload: bytes) -> None:
        nonlocal number
        token = box.encrypt(file_id + number.to_bytes(8, "big") + kind + payload)
        sealed.write(len(token).to_bytes(4, "big"))
        sealed.write(token)
        number += 1

    with source.open("rb") as plain, target.open("wb") as sealed:
        sealed.write(MAGIC)
        while chunk := plain.read(CHUNK):
            put(sealed, b"D", chunk)
            total += len(chunk)
        put(sealed, b"E", total.to_bytes(8, "big"))


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


def _records(handle):
    """The tokens of a streamed backup; a record cut short is an error."""
    while size := handle.read(4):
        if len(size) < 4:
            raise BackupCorrupt("The backup ends inside a record.")
        length = int.from_bytes(size, "big")
        token = handle.read(length)
        if len(token) < length:
            raise BackupCorrupt("The backup ends inside a record.")
        yield token


def _open(box: Fernet, token: bytes) -> bytes:
    try:
        return box.decrypt(token)
    except InvalidToken:
        raise BackupCorrupt("A record does not match the key or was changed.") from None


def _decrypt_stream(handle, plain, box: Fernet) -> None:
    file_id = None
    written = 0
    ended = False
    for expected, token in enumerate(_records(handle)):
        if ended:
            raise BackupCorrupt("Data follows the end of the backup.")
        record = _open(box, token)
        if len(record) < _HEAD:
            raise BackupCorrupt("A record is malformed.")
        this_id, number, kind = record[:16], int.from_bytes(record[16:24], "big"), record[24:25]
        file_id = file_id or this_id
        if this_id != file_id or number != expected:
            raise BackupCorrupt("Records are missing, out of order or from another backup.")
        if kind == b"D":
            plain.write(record[_HEAD:])
            written += len(record) - _HEAD
        elif kind == b"E":
            if int.from_bytes(record[_HEAD:], "big") != written:
                raise BackupCorrupt("The backup is shorter than when it was made.")
            ended = True
        else:
            raise BackupCorrupt("A record is malformed.")
    if not ended:
        raise BackupCorrupt("The backup is incomplete: its end record is missing.")


def decrypt_to(name: str, out: Path) -> None:
    """Decrypt a stored backup to ``out``, chunk by chunk (or whole, for an older backup).
    Raises BackupCorrupt, and leaves no ``out``, when the backup is incomplete or changed."""
    box = fernet()
    out = Path(out)
    try:
        with default_storage.open(name, "rb") as handle, out.open("wb") as plain:
            head = handle.read(len(MAGIC))
            if head == MAGIC:
                _decrypt_stream(handle, plain, box)
            elif head == MAGIC_V1:  # streamed, before records were numbered and sealed
                for token in _records(handle):
                    plain.write(_open(box, token))
            else:  # a single token, before the streamed format
                plain.write(_open(box, head + handle.read()))
    except BaseException:
        out.unlink(missing_ok=True)
        raise


def decrypt(name: str) -> bytes:
    with tempfile.TemporaryDirectory() as work:
        out = Path(work) / "plain"
        decrypt_to(name, out)
        return out.read_bytes()
