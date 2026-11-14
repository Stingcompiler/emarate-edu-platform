from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.management import CommandError, call_command

from core import backups
from core.backups import DB_SUFFIX


@pytest.fixture
def fake_dump(monkeypatch, settings):
    settings.BACKUP_ENCRYPTION_KEY = "offline-backup-secret"
    counter = iter(range(100))
    monkeypatch.setattr(backups, "dump_to", lambda path: path.write_bytes(b"PGDMP-fake-dump"))
    # Distinct names within the same second.
    real = backups.datetime

    class Clock:
        @staticmethod
        def now(tz):
            return real(2026, 9, 28, 3, 0, next(counter), tzinfo=tz)

    monkeypatch.setattr(backups, "datetime", Clock)


def test_backup_is_encrypted_and_pruned(fake_dump, db, tmp_path, capsys):
    for _ in range(3):
        call_command("backup_database", keep=2)
    names = backups.existing()
    assert len(names) == 2 and names[-1].endswith("030002Z.dump.enc")
    from django.core.files.storage import default_storage

    with default_storage.open(names[-1], "rb") as handle:
        stored = handle.read()
    assert b"PGDMP" not in stored  # encrypted at rest
    assert backups.decrypt(names[-1]) == b"PGDMP-fake-dump"
    out = tmp_path / "restore.dump"
    call_command("restore_database", name=names[-1], out=str(out))
    assert out.read_bytes() == b"PGDMP-fake-dump"
    from audit.models import AuditLog

    assert AuditLog.objects.filter(action="backup.create").count() == 3


def test_backup_needs_a_key_and_postgres(settings, db):
    settings.BACKUP_ENCRYPTION_KEY = ""
    with pytest.raises(ImproperlyConfigured):
        backups.fernet()
    settings.BACKUP_ENCRYPTION_KEY = "k"
    if "sqlite" in settings.DATABASES["default"]["ENGINE"]:
        with pytest.raises(ImproperlyConfigured):
            backups._pg_env_and_args()


def test_local_media_is_archived_beside_the_dump(fake_dump, db, settings, tmp_path):
    """On a single server the uploaded files are part of the backup (not the backups folder)."""
    import io
    import tarfile

    settings.MEDIA_BACKEND = "local"
    settings.MEDIA_ROOT = tmp_path / "media"
    (tmp_path / "media/public").mkdir(parents=True)
    (tmp_path / "media/private/submissions").mkdir(parents=True)
    (tmp_path / "media/private/backups").mkdir(parents=True)
    (tmp_path / "media/public/cover.jpg").write_bytes(b"jpg")
    (tmp_path / "media/private/submissions/a.pdf").write_bytes(b"pdf")
    (tmp_path / "media/private/backups/old.dump.enc").write_bytes(b"old")

    for _ in range(3):
        call_command("backup_database", keep=2)
    media = backups.existing(backups.MEDIA_SUFFIX)
    assert len(media) == 2 and len(backups.existing()) == 2  # each pruned on its own
    with tarfile.open(fileobj=io.BytesIO(backups.decrypt(media[-1])), mode="r:gz") as archive:
        names = sorted(archive.getnames())
    assert names == ["private/submissions/a.pdf", "public/cover.jpg"]

    out = tmp_path / "media.tar.gz"
    call_command("restore_database", name=media[-1], out=str(out))
    with tarfile.open(out) as unpacked:
        assert unpacked.getnames()


def test_media_on_bunny_is_not_archived(fake_dump, db, settings):
    settings.MEDIA_BACKEND = "bunny"
    assert backups.media_archive_to(Path("/nonexistent/media.tar.gz")) is False


def test_large_backups_stream_in_chunks_and_old_ones_still_read(
    fake_dump, db, monkeypatch, tmp_path
):
    """Review 2026-10-04 A14: the dump was held in memory and encrypted in one piece."""
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    monkeypatch.setattr(backups, "CHUNK", 5)  # many chunks from a small fake dump
    name = backups.create(keep=8)[0]
    with default_storage.open(name, "rb") as handle:
        stored = handle.read()
    assert stored.startswith(backups.MAGIC) and b"PGDMP" not in stored
    assert backups.decrypt(name) == b"PGDMP-fake-dump"

    old = default_storage.save(
        "backups/ecst-20200101T000000Z.dump.enc",
        ContentFile(backups.fernet().encrypt(b"PGDMP-old-format")),
    )
    out = tmp_path / "old.dump"
    backups.decrypt_to(old, out)
    assert out.read_bytes() == b"PGDMP-old-format"


def test_a_cut_or_changed_backup_is_refused(fake_dump, db, monkeypatch, tmp_path):
    """Review 2026-10-08 R07: a backup cut after a whole record decrypted «successfully» to a
    shorter dump. Now every record is numbered and the last one seals the total."""
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    monkeypatch.setattr(backups, "CHUNK", 4)
    monkeypatch.setattr(backups, "media_archive_to", lambda path: False)  # the dump is enough
    name = backups.create(keep=8)[0]
    with default_storage.open(name, "rb") as handle:
        stored = handle.read()
    assert backups.decrypt(name) == b"PGDMP-fake-dump"

    def records(data):
        at, out = len(backups.MAGIC), []
        while at < len(data):
            size = int.from_bytes(data[at : at + 4], "big")
            out.append(data[at : at + 4 + size])
            at += 4 + size
        return out

    parts = records(stored)
    assert len(parts) == 5  # 4 data records of 4 bytes or fewer, and the end record
    broken = {
        "cut after a record": backups.MAGIC + parts[0],
        "end record missing": backups.MAGIC + b"".join(parts[:-1]),
        "cut inside a record": stored[:-7],
        "a record dropped": backups.MAGIC + b"".join(parts[:1] + parts[2:]),
        "records swapped": backups.MAGIC + b"".join([parts[1], parts[0], *parts[2:]]),
        "data after the end": stored + parts[0],
    }
    for label, data in broken.items():
        saved = default_storage.save(f"backups/broken{DB_SUFFIX}", ContentFile(data))
        out = tmp_path / "plain"
        with pytest.raises(backups.BackupCorrupt):
            backups.decrypt_to(saved, out)
        assert not out.exists(), label  # nothing half-written to restore by mistake
        default_storage.delete(saved)

    # Another backup's record cannot be spliced in: each file has its own id.
    other = backups.create(keep=8)[-1]
    with default_storage.open(other, "rb") as handle:
        foreign = records(handle.read())
    saved = default_storage.save(
        f"backups/spliced{DB_SUFFIX}",
        ContentFile(backups.MAGIC + b"".join([parts[0], foreign[1], *parts[2:]])),
    )
    with pytest.raises(backups.BackupCorrupt):
        backups.decrypt(saved)
    with pytest.raises(CommandError, match="cannot be restored"):
        call_command("restore_database", name=saved, out=str(tmp_path / "x.dump"))


def test_streamed_backups_from_before_the_seal_still_read(fake_dump, db, tmp_path):
    """Backups made by the first streamed format (ECSTBAK1, no numbers) stay restorable."""
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    box = backups.fernet()
    data = backups.MAGIC_V1
    for chunk in (b"PGDMP-", b"v1"):
        token = box.encrypt(chunk)
        data += len(token).to_bytes(4, "big") + token
    name = default_storage.save(f"backups/ecst-v1{DB_SUFFIX}", ContentFile(data))
    assert backups.decrypt(name) == b"PGDMP-v1"


def test_backups_on_the_server_disk_are_readable_by_their_owner_alone(
    fake_dump, db, tmp_path, monkeypatch
):
    """Review 2026-11-10, R83: the files were -rw-r--r-- on a shared server (encrypted, but no
    other account needs them)."""
    import os
    import stat

    from django.core.files.storage import FileSystemStorage

    disk = FileSystemStorage(location=tmp_path / "private")
    monkeypatch.setattr(backups, "default_storage", disk)
    old = os.umask(0o022)  # the server's default: new files are -rw-r--r--
    try:
        stored = backups.create(keep=2)
    finally:
        os.umask(old)
    assert stored
    for name in stored:
        assert stat.S_IMODE(os.stat(disk.path(name)).st_mode) == 0o600


# ─── The downloadable file (owner, 2026-11-14) ──────────────────────────────────────────


FILE_PHRASE = "a-long-file-password"


def _package(stamp):
    return b"".join(backups.package(stamp, backups.package_key(FILE_PHRASE)))


@pytest.fixture
def own_storage(settings, tmp_path):
    """A storage of this test's own: the shared one keeps earlier tests' copies, and a second
    copy of the same second is stored under another name."""
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(tmp_path / "stored")},
        },
    }


def _stamp_of(name):
    return name.rsplit("-", 1)[-1].split(".", 1)[0]


@pytest.fixture
def copy_with_files(fake_dump, own_storage, db, settings, tmp_path, monkeypatch):
    settings.MEDIA_BACKEND = "local"
    settings.MEDIA_ROOT = tmp_path / "media"
    (tmp_path / "media/public").mkdir(parents=True)
    (tmp_path / "media/public/cover.jpg").write_bytes(b"jpg" * 7)
    monkeypatch.setattr(backups, "CHUNK", 4)  # several records for each part
    return _stamp_of(backups.create(keep=8)[0])


def test_a_copy_notes_what_the_platform_held(copy_with_files, django_user_model):
    details = backups.info(copy_with_files)
    assert details["stamp"] == copy_with_files and details["format"] == 1
    assert details["counts"] == {"users": 0, "students": 0, "courses": 0, "applications": 0}
    django_user_model.objects.create_user(email="a@x.test", password="x", full_name_ar="أ")
    assert backups.snapshot()["users"] == 1  # today's number, beside the copy's
    assert backups.info("20000101T000000Z") is None  # a copy older than the note


def test_the_downloaded_file_opens_with_its_password_alone(copy_with_files, settings, tmp_path):
    import io
    import tarfile

    packed = _package(copy_with_files)
    assert packed.startswith(backups.PACKAGE_MAGIC)
    assert b"PGDMP" not in packed and b"jpg" not in packed
    # Another server: its own key, which never made this file.
    settings.BACKUP_ENCRYPTION_KEY = "another-server"
    assert backups.read_package(io.BytesIO(packed), FILE_PHRASE)["counts"] is not None
    database, files = tmp_path / "db.dump", tmp_path / "media.tar.gz"
    details = backups.read_package(io.BytesIO(packed), FILE_PHRASE, database, files)
    assert details["stamp"] == copy_with_files and details["files"] is True
    assert database.read_bytes() == b"PGDMP-fake-dump"
    with tarfile.open(files) as archive:
        assert archive.getnames() == ["public/cover.jpg"]


def test_a_copy_without_files_packs_the_database_alone(fake_dump, own_storage, db, tmp_path):
    import io

    stamp = _stamp_of(backups.create(keep=8)[0])
    database, files = tmp_path / "db.dump", tmp_path / "media.tar.gz"
    details = backups.read_package(io.BytesIO(_package(stamp)), FILE_PHRASE, database, files)
    assert details["files"] is False
    assert database.read_bytes() == b"PGDMP-fake-dump" and not files.exists()


def test_a_wrong_password_or_a_changed_file_opens_nothing(copy_with_files, tmp_path):
    import io

    packed = _package(copy_with_files)
    database, files = tmp_path / "db.dump", tmp_path / "media.tar.gz"
    with pytest.raises(backups.WrongPassword):
        backups.read_package(io.BytesIO(packed), "another-password", database, files)

    def records(data):
        at, out = backups._PACKAGE_HEAD, []
        while at < len(data):
            size = int.from_bytes(data[at : at + 4], "big")
            out.append(data[at : at + 4 + size])
            at += 4 + size
        return out

    head, parts = packed[: backups._PACKAGE_HEAD], records(packed)
    broken = {
        "not a backup file": b"PK\x03\x04" + packed[4:],
        "cut inside a record": packed[:-9],
        "end record missing": head + b"".join(parts[:-1]),
        "a record dropped": head + b"".join(parts[:2] + parts[3:]),
        "records swapped": head + b"".join([parts[0], parts[2], parts[1], *parts[3:]]),
        "a made-up work factor": packed[:8] + bytes([60]) + packed[9:],
    }
    for case, data in broken.items():
        with pytest.raises(backups.BackupCorrupt):
            backups.read_package(io.BytesIO(data), FILE_PHRASE, database, files)
        assert not database.exists() and not files.exists(), case
    # The details alone need the first record only, and the password all the same.
    with pytest.raises(backups.WrongPassword):
        backups.read_package(io.BytesIO(packed), "another-password")


def test_a_copy_that_is_gone_is_refused_before_the_first_byte(fake_dump, db):
    with pytest.raises(FileNotFoundError):
        backups.package("20000101T000000Z", backups.package_key(FILE_PHRASE))


def _sqlite_at(monkeypatch, settings, path):
    """Point the settings at a SQLite file for one test (undone after it: the dictionary is
    shared, and a plain assignment into it would outlive the test)."""
    monkeypatch.setitem(
        settings.DATABASES,
        "default",
        {**settings.DATABASES["default"], "ENGINE": "django.db.backends.sqlite3", "NAME": path},
    )


def test_development_copies_the_sqlite_file(settings, tmp_path, monkeypatch):
    """Development runs on SQLite: the copy is the database file, so the flow needs no services."""
    import sqlite3

    live = tmp_path / "live.sqlite3"
    with sqlite3.connect(live) as connection:
        connection.execute("create table t (v text)")
        connection.execute("insert into t values ('kept')")
    _sqlite_at(monkeypatch, settings, live)
    out = tmp_path / "copy.sqlite3"
    backups.dump_to(out)
    with sqlite3.connect(out) as connection:
        assert connection.execute("select v from t").fetchall() == [("kept",)]
