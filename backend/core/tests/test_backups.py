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
