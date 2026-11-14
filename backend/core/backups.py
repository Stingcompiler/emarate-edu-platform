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

Beside them goes a small ``ecst-info-<time>.json.enc``: what the platform held when the copy
was made, which the confirmation before a restore shows next to what it holds now.

**The downloadable file** (owner, 2026-11-14: «قد ننقل النظام لاستضافة أخرى يومًا ما»): one
``.ecstbak`` holding the database and the files of a copy, encrypted with a password the admin
types when downloading — not with this server's key, which may be lost with the server. On the
new host the file and its password are all that is needed (``package`` / ``read_package``).

Development runs on SQLite: there the «dump» is the database file itself, so the whole flow
can be tried with no services. A copy is restored only on the engine that made it.
"""

from __future__ import annotations

import base64
import json
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
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files import File
from django.core.files.storage import default_storage

PREFIX = "backups"
DB_SUFFIX = ".dump.enc"
MEDIA_SUFFIX = ".tar.gz.enc"
INFO_SUFFIX = ".json.enc"
PACKAGE_SUFFIX = ".ecstbak"

# What the confirmation before a restore compares: the copy's numbers and today's.
COUNTED = {
    "users": "accounts.User",
    "students": "students.StudentRecord",
    "courses": "academic.Course",
    "applications": "admissions.Application",
}


def engine() -> str:
    return "postgresql" if "postgresql" in settings.DATABASES["default"]["ENGINE"] else "sqlite"


def snapshot() -> dict:
    """How much the platform holds right now."""
    from django.apps import apps

    return {key: apps.get_model(label).objects.count() for key, label in COUNTED.items()}


def names_of(stamp: str) -> dict[str, str]:
    """The stored names of one copy's parts."""
    return {
        "database": f"{PREFIX}/ecst-{stamp}{DB_SUFFIX}",
        "files": f"{PREFIX}/ecst-media-{stamp}{MEDIA_SUFFIX}",
        "info": f"{PREFIX}/ecst-info-{stamp}{INFO_SUFFIX}",
    }


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


def _sqlite_copy(path: Path) -> None:
    """SQLite's online backup: a whole, consistent file even while the server writes."""
    import sqlite3

    source = sqlite3.connect(str(settings.DATABASES["default"]["NAME"]))
    target = sqlite3.connect(str(path))
    try:
        source.backup(target)
    finally:
        source.close()
        target.close()


def dump_to(path: Path) -> None:
    if engine() == "sqlite":
        _sqlite_copy(path)
        return
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


class _Sealer:
    """Numbers and seals the records of one file: every record carries the file's random id
    and its place in the order, so none can be dropped, moved or borrowed."""

    def __init__(self, box: Fernet):
        self.box = box
        self.file_id = os.urandom(16)
        self.number = 0

    def record(self, kind: bytes, payload: bytes) -> bytes:
        token = self.box.encrypt(self.file_id + self.number.to_bytes(8, "big") + kind + payload)
        self.number += 1
        return len(token).to_bytes(4, "big") + token


def _encrypt_file(source: Path, target: Path, box: Fernet) -> None:
    sealer = _Sealer(box)
    total = 0
    with source.open("rb") as plain, target.open("wb") as sealed:
        sealed.write(MAGIC)
        while chunk := plain.read(CHUNK):
            sealed.write(sealer.record(b"D", chunk))
            total += len(chunk)
        sealed.write(sealer.record(b"E", total.to_bytes(8, "big")))


def create(keep: int) -> list[str]:
    """Dump, encrypt, store (plus the uploaded files on a local disk); keep the newest ``keep``
    of each. Returns the stored names. Works through temporary files, chunk by chunk."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    box = fernet()
    stored = []
    with tempfile.TemporaryDirectory(prefix="ecst-backup-") as work:
        work = Path(work)
        names = names_of(stamp)
        details = {"format": 1, "stamp": stamp, "engine": engine(), "counts": snapshot()}
        parts = [(work / "db.dump", names["database"])]
        dump_to(parts[0][0])
        if media_archive_to(work / "media.tar.gz"):
            parts.append((work / "media.tar.gz", names["files"]))
        (work / "info.json").write_text(json.dumps(details))
        parts.append((work / "info.json", names["info"]))
        for plain, name in parts:
            sealed = plain.with_suffix(plain.suffix + ".enc")
            _encrypt_file(plain, sealed, box)
            plain.unlink()
            with sealed.open("rb") as handle:
                saved = default_storage.save(name, File(handle))
            if not name.endswith(INFO_SUFFIX):  # the callers name the copy by its two parts
                stored.append(saved)
            _owner_only(saved)
            sealed.unlink()
    prune(keep)
    return stored


def _owner_only(name: str) -> None:
    """A backup on the server's own disk is readable by its owner alone (review 2026-11-10,
    R83: they were -rw-r--r-- on a shared server; encrypted, but no other account needs them).
    Storage without a local path (Bunny) has nothing to change."""
    try:
        path = default_storage.path(name)
    except NotImplementedError:
        return
    if os.path.exists(path):  # a storage kept in memory (the tests) has no file there
        os.chmod(path, 0o600)


def existing(suffix: str = DB_SUFFIX) -> list[str]:
    try:
        _, files = default_storage.listdir(PREFIX)
    except FileNotFoundError:
        return []
    return sorted(f"{PREFIX}/{f}" for f in files if f.endswith(suffix))


def prune(keep: int) -> list[str]:
    stale = []
    for suffix in (DB_SUFFIX, MEDIA_SUFFIX, INFO_SUFFIX):
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


def _sealed_chunks(handle, box: Fernet):
    """The plain chunks of a sealed stream (ECSTBAK2), in order; BackupCorrupt at the first
    record that is missing, moved, changed or from another file, and when the end is missing."""
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
            written += len(record) - _HEAD
            yield record[_HEAD:]
        elif kind == b"E":
            if int.from_bytes(record[_HEAD:], "big") != written:
                raise BackupCorrupt("The backup is shorter than when it was made.")
            ended = True
        else:
            raise BackupCorrupt("A record is malformed.")
    if not ended:
        raise BackupCorrupt("The backup is incomplete: its end record is missing.")


def iter_plain(name: str):
    """A stored backup's plain bytes, a chunk at a time (an older backup in one piece)."""
    box = fernet()
    with default_storage.open(name, "rb") as handle:
        head = handle.read(len(MAGIC))
        if head == MAGIC:
            yield from _sealed_chunks(handle, box)
        elif head == MAGIC_V1:  # streamed, before records were numbered and sealed
            for token in _records(handle):
                yield _open(box, token)
        else:  # a single token, before the streamed format
            yield _open(box, head + handle.read())


def decrypt_to(name: str, out: Path) -> None:
    """Decrypt a stored backup to ``out``, chunk by chunk (or whole, for an older backup).
    Raises BackupCorrupt, and leaves no ``out``, when the backup is incomplete or changed."""
    out = Path(out)
    try:
        with out.open("wb") as plain:
            for chunk in iter_plain(name):
                plain.write(chunk)
    except BaseException:
        out.unlink(missing_ok=True)
        raise


def decrypt(name: str) -> bytes:
    with tempfile.TemporaryDirectory() as work:
        out = Path(work) / "plain"
        decrypt_to(name, out)
        return out.read_bytes()


def info(stamp: str) -> dict | None:
    """What the platform held when the copy was made; None for a copy older than this note."""
    name = names_of(stamp)["info"]
    try:
        if not default_storage.exists(name):
            return None
        return json.loads(decrypt(name))
    except (BackupCorrupt, ValueError, ImproperlyConfigured, OSError):
        return None


# ─── The downloadable file ──────────────────────────────────────────────────────────────
# PACKAGE_MAGIC, one byte (log2 of scrypt's work factor), a 16-byte salt, then sealed records
# like a stored backup's, under a key made from the file's password: b"I" (first) the copy's
# details as JSON, b"D" the database, b"F" the files archive, b"E" (last) both totals.
PACKAGE_MAGIC = b"ECSTPKG1"
_PACKAGE_HEAD = len(PACKAGE_MAGIC) + 1 + 16
PASSWORD_MIN = 10


class WrongPassword(Exception):
    """The password does not open this file."""


def _password_box(password: str, salt: bytes, log_n: int) -> Fernet:
    key = Scrypt(salt=salt, length=32, n=2**log_n, r=8, p=1).derive(password.encode())
    return Fernet(base64.urlsafe_b64encode(key))


def package_key(password: str) -> dict:
    """The file's key, made from its password once (it costs memory and half a second), in a
    shape that can wait in the cache for the download to start — never the password itself."""
    log_n = int(getattr(settings, "BACKUP_SCRYPT_LOG_N", 17))
    salt = os.urandom(16)
    key = Scrypt(salt=salt, length=32, n=2**log_n, r=8, p=1).derive(password.encode())
    return {
        "log_n": log_n,
        "salt": base64.b64encode(salt).decode(),
        "key": base64.urlsafe_b64encode(key).decode(),
    }


def package(stamp: str, key: dict):
    """The downloadable file of one copy, as an iterator of bytes: nothing is written to disk
    and memory stays at one chunk. Raises FileNotFoundError before the first byte when the
    copy is gone; a stored part that turns out damaged cuts the stream short, which leaves a
    file without its end record — one that ``read_package`` refuses."""
    names = names_of(stamp)
    if not default_storage.exists(names["database"]):
        raise FileNotFoundError(names["database"])
    files = names["files"] if default_storage.exists(names["files"]) else None
    details = {
        "format": 1,
        "stamp": stamp,
        "engine": engine(),
        "counts": None,
        **(info(stamp) or {}),
        "files": files is not None,
    }
    salt = base64.b64decode(key["salt"])
    header = PACKAGE_MAGIC + bytes([key["log_n"]]) + salt
    sealer = _Sealer(Fernet(key["key"].encode()))

    def stream():
        yield header
        yield sealer.record(b"I", json.dumps(details).encode())
        totals = []
        for kind, name in ((b"D", names["database"]), (b"F", files)):
            total = 0
            for chunk in iter_plain(name) if name else ():
                total += len(chunk)
                yield sealer.record(kind, chunk)
            totals.append(total)
        yield sealer.record(b"E", b"".join(t.to_bytes(8, "big") for t in totals))

    return stream()


def read_package(handle, password: str, database: Path | None = None, files: Path | None = None):
    """Open a downloaded file with its password. With no targets, only its details are read
    (the password is checked on the way). With ``database`` (and ``files``), the two parts are
    written there, chunk by chunk; ``files`` is left absent when the copy carried none.
    WrongPassword when the password does not open it; BackupCorrupt when it is not a backup
    file, or is incomplete or changed — and then nothing is left at the targets."""
    head = handle.read(_PACKAGE_HEAD)
    if len(head) < _PACKAGE_HEAD or not head.startswith(PACKAGE_MAGIC):
        raise BackupCorrupt("This is not a backup file of the platform.")
    log_n = head[len(PACKAGE_MAGIC)]
    if not 1 <= log_n <= 20:  # a made-up header must not ask for all the memory there is
        raise BackupCorrupt("This is not a backup file of the platform.")
    box = _password_box(password, head[len(PACKAGE_MAGIC) + 1 :], log_n)
    records = _records(handle)
    try:
        first = box.decrypt(next(records, b""))
    except InvalidToken:
        raise WrongPassword from None
    if len(first) < _HEAD or first[16:25] != (0).to_bytes(8, "big") + b"I":
        raise BackupCorrupt("A record is malformed.")
    file_id = first[:16]
    try:
        details = json.loads(first[_HEAD:])
    except ValueError:
        raise BackupCorrupt("A record is malformed.") from None
    if database is None:
        return details

    targets = {b"D": Path(database), b"F": Path(files) if files else None}
    written = {b"D": 0, b"F": 0}
    ended = False
    opened = {}
    try:
        for expected, token in enumerate(records, start=1):
            if ended:
                raise BackupCorrupt("Data follows the end of the backup.")
            record = _open(box, token)
            if len(record) < _HEAD:
                raise BackupCorrupt("A record is malformed.")
            number, kind = int.from_bytes(record[16:24], "big"), record[24:25]
            if record[:16] != file_id or number != expected:
                raise BackupCorrupt("Records are missing, out of order or from another backup.")
            if kind in targets:
                written[kind] += len(record) - _HEAD
                if targets[kind] is not None:
                    if kind not in opened:
                        opened[kind] = targets[kind].open("wb")
                    opened[kind].write(record[_HEAD:])
            elif kind == b"E":
                totals = record[_HEAD:]
                if totals != b"".join(written[k].to_bytes(8, "big") for k in (b"D", b"F")):
                    raise BackupCorrupt("The backup is shorter than when it was made.")
                ended = True
            else:
                raise BackupCorrupt("A record is malformed.")
        if not ended:
            raise BackupCorrupt("The backup is incomplete: its end record is missing.")
        if not written[b"D"]:
            raise BackupCorrupt("The backup holds no database.")
    except BaseException:
        for handle_ in opened.values():
            handle_.close()
        for target in targets.values():
            if target is not None:
                target.unlink(missing_ok=True)
        raise
    for handle_ in opened.values():
        handle_.close()
    return {**details, "files": written[b"F"] > 0}
