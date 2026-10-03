import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command

from core import backups


@pytest.fixture
def fake_dump(monkeypatch, settings):
    settings.BACKUP_ENCRYPTION_KEY = "offline-backup-secret"
    counter = iter(range(100))
    monkeypatch.setattr(backups, "dump", lambda: b"PGDMP-fake-dump")
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
    assert backups.media_archive() is None
