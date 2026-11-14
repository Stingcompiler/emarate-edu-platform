"""«استعادة» (owner, 2026-11-14): a kept copy put back over the running platform — checked
first, the present state kept, the database all or nothing, the files swapped (core.restore)."""

import io
import shutil
import sqlite3
import tarfile

import pytest
from django.core.cache import cache

from core import backups, maintenance, restore
from core.tests.test_backups import _sqlite_at


@pytest.fixture
def place(settings, tmp_path, monkeypatch):
    """A media folder and a private storage inside it, as on the server."""
    root = tmp_path / "media"
    settings.MEDIA_BACKEND = "local"
    settings.MEDIA_ROOT = root
    settings.BACKUP_ENCRYPTION_KEY = "offline-backup-secret"
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(root / "private")},
        },
    }
    (root / "public").mkdir(parents=True)
    (root / "private/submissions").mkdir(parents=True)
    (root / "public/logo.png").write_bytes(b"logo-then")
    (root / "private/submissions/a.pdf").write_bytes(b"pdf-then")
    cache.delete(restore.STATE)
    return root


@pytest.fixture
def fake_database(monkeypatch):
    """The database's own tools are stood in for: the flow around them is what is tested
    here (the real thing runs in test_a_real_restore_on_postgresql and in the E2E)."""
    done = []
    monkeypatch.setattr(backups, "dump_to", lambda path: path.write_bytes(b"PGDMP-fake-dump"))
    monkeypatch.setattr(restore, "check_dump", lambda dump: None)
    monkeypatch.setattr(
        restore, "restore_database", lambda dump, work: done.append(dump.read_bytes())
    )
    monkeypatch.setattr(restore, "missing_tools", lambda: [])
    return done


def _copy():
    return restore._stamp_of(backups.create(keep=0)[0])


def _later(place):
    """What happens after the copy: a file changes, one arrives, one more backup is made."""
    (place / "public/logo.png").write_bytes(b"logo-now")
    (place / "private/submissions/b.pdf").write_bytes(b"pdf-later")


def test_a_restore_puts_the_copy_back_and_keeps_what_it_replaced(
    place, fake_database, db, django_user_model, monkeypatch
):
    seen = {}
    real = restore.restore_database
    monkeypatch.setattr(
        restore,
        "restore_database",
        lambda dump, work: (seen.update(closed=maintenance.state()), real(dump, work)),
    )
    stamp = _copy()
    _later(place)
    admin = django_user_model.objects.create_user(
        email="admin@x.test", password="x", full_name_ar="المدير"
    )
    result = restore.run(stamp, admin.pk, admin.email)

    assert result["state"] == "done" and result["error"] == "", result
    assert fake_database == [b"PGDMP-fake-dump"]
    # The platform was closed while the rows were replaced, and is open again.
    assert seen["closed"]["reason"] == "restore" and maintenance.state() is None
    # The files are the copy's; the newer ones stepped aside, they were not deleted.
    assert (place / "public/logo.png").read_bytes() == b"logo-then"
    assert not (place / "private/submissions/b.pdf").exists()
    (aside,) = [p for p in place.iterdir() if p.name.startswith(restore.REPLACED_PREFIX)]
    assert (aside / "public/logo.png").read_bytes() == b"logo-now"
    assert (aside / "private/submissions/b.pdf").read_bytes() == b"pdf-later"
    # The backups themselves never moved, and the state before the restore is one of them.
    kept = result["kept_before"]
    assert kept != stamp and backups.names_of(kept)["database"] in backups.existing()
    assert backups.names_of(stamp)["database"] in backups.existing()
    # On the record, in the rows that are there now.
    from audit.models import AuditLog

    entry = AuditLog.objects.get(action="backup.restore")
    assert entry.actor == admin and entry.target_id == stamp
    assert entry.new == {"by": "admin@x.test", "kept_before": kept}


def test_a_copy_that_cannot_be_taken_changes_nothing(place, fake_database, db, monkeypatch):
    stamp = _copy()
    _later(place)

    def newer(dump):
        raise restore.RestoreRefused("newer", "made by newer code")

    monkeypatch.setattr(restore, "check_dump", newer)
    before = len(backups.existing())
    result = restore.run(stamp)
    assert result["state"] == "failed" and result["code"] == "newer"
    assert fake_database == [] and maintenance.state() is None
    assert (place / "public/logo.png").read_bytes() == b"logo-now"
    assert len(backups.existing()) == before  # not even a copy of the present was needed
    assert not [p for p in place.iterdir() if p.name.startswith(".")]

    assert restore.run("20000101T000000Z")["code"] == "gone"
    # A copy cut short on the disk.
    from django.core.files.storage import default_storage

    path = default_storage.path(backups.names_of(stamp)["database"])
    data = open(path, "rb").read()  # noqa: SIM115
    open(path, "wb").write(data[:-20])  # noqa: SIM115
    assert restore.run(stamp)["code"] == "corrupt"
    assert fake_database == []


def test_a_database_that_fails_to_load_leaves_everything(place, fake_database, db, monkeypatch):
    stamp = _copy()
    _later(place)

    def broken(dump, work):
        raise RuntimeError("psql: lock timeout")

    monkeypatch.setattr(restore, "restore_database", broken)
    result = restore.run(stamp)
    assert result["state"] == "failed" and result["code"] == "error"
    assert "لم يتغيّر شيء" in result["error"]  # in Arabic, whoever's language the worker runs in
    assert maintenance.state() is None
    assert (place / "public/logo.png").read_bytes() == b"logo-now"
    assert not [p for p in place.iterdir() if p.name.startswith(".")]


def test_a_failure_after_the_database_says_where_the_old_state_is(
    place, fake_database, db, monkeypatch
):
    stamp = _copy()

    def broken(*args, **kwargs):
        raise RuntimeError("migrate failed")

    monkeypatch.setattr("django.core.management.call_command", broken)
    result = restore.run(stamp)
    assert result["state"] == "failed" and result["code"] == "half"
    assert result["kept_before"] and maintenance.state() is None


def test_what_a_restore_set_aside_is_not_backed_up_and_goes_after_a_week(place, fake_database, db):
    import os
    import time

    stamp = _copy()
    _later(place)
    restore.run(stamp)
    (aside,) = [p for p in place.iterdir() if p.name.startswith(restore.REPLACED_PREFIX)]
    again = _copy()
    archive = backups.decrypt(backups.names_of(again)["files"])
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        assert sorted(tar.getnames()) == ["private/submissions/a.pdf", "public/logo.png"]
    assert aside.exists()  # the copy just made did not clear a fresh one
    old = time.time() - 8 * 86400
    os.utime(aside, (old, old))
    assert restore.purge_replaced() == [aside.name] and not aside.exists()


def test_an_archive_cannot_write_outside_its_folder(place, tmp_path):
    hostile = tmp_path / "hostile.tar.gz"
    with tarfile.open(hostile, mode="w:gz") as tar:
        entry = tarfile.TarInfo("../../escaped.txt")
        entry.size = 3
        tar.addfile(entry, io.BytesIO(b"out"))
    with pytest.raises(tarfile.TarError):
        restore.stage_files(hostile, place)
    assert not (tmp_path / "escaped.txt").exists() and not (place.parent / "escaped.txt").exists()


def test_a_copy_from_newer_code_or_another_engine_is_refused(settings, tmp_path, monkeypatch):
    """The check that runs before anything is touched, on a real SQLite file."""
    live = tmp_path / "live.sqlite3"
    _sqlite_at(monkeypatch, settings, live)
    known = sorted(restore._migrations_in_code())[:3]

    def dump(rows):
        path = tmp_path / f"dump-{len(rows)}.sqlite3"
        with sqlite3.connect(path) as connection:
            connection.execute("create table django_migrations (app text, name text)")
            connection.executemany("insert into django_migrations values (?, ?)", rows)
        connection.close()
        return path

    restore.check_dump(dump(known))  # older code's copy: fine, the migrations follow
    with pytest.raises(restore.RestoreRefused) as refused:
        restore.check_dump(dump([*known, ("academic", "9999_from_the_future")]))
    assert refused.value.code == "newer"
    postgres = tmp_path / "pg.dump"
    postgres.write_bytes(b"PGDMP" + b"\x00" * 64)
    with pytest.raises(restore.RestoreRefused) as refused:
        restore.check_dump(postgres)
    assert refused.value.code == "engine"
    empty = tmp_path / "empty.sqlite3"
    with sqlite3.connect(empty) as connection:
        connection.execute("create table other (v text)")
    connection.close()
    with pytest.raises(restore.RestoreRefused) as refused:
        restore.check_dump(empty)
    assert refused.value.code == "unreadable"


def test_development_restores_the_sqlite_file(settings, tmp_path, monkeypatch):
    live, copy = tmp_path / "live.sqlite3", tmp_path / "copy.sqlite3"
    for path, value in ((live, "now"), (copy, "then")):
        with sqlite3.connect(path) as connection:
            connection.execute("create table t (v text)")
            connection.execute("insert into t values (?)", (value,))
        connection.close()
    _sqlite_at(monkeypatch, settings, live)
    restore._sqlite_restore(copy)
    with sqlite3.connect(live) as connection:
        assert connection.execute("select v from t").fetchall() == [("then",)]
    connection.close()


def _postgres_tools_match() -> bool:
    """pg_dump refuses a server newer than itself; then this machine cannot run the test."""
    import re
    import subprocess

    from django.db import connection

    if connection.vendor != "postgresql" or restore.missing_tools():
        return False
    out = subprocess.run(  # noqa: S603
        [shutil.which("pg_dump"), "--version"], capture_output=True, check=False
    ).stdout.decode()
    version = re.search(r"\) (\d+)", out)  # "pg_dump (PostgreSQL) 16.4 (Homebrew)"
    client = int(version.group(1)) if version else 0
    return client >= connection.pg_version // 10000


@pytest.mark.django_db(transaction=True)
def test_a_real_restore_on_postgresql(place, django_user_model):
    """The real tools on the real (test) database: rows back as they were, a table added
    since gone, the migrations in place, and the next query simply works."""
    if not _postgres_tools_match():
        pytest.skip("needs PostgreSQL and client tools no older than the server")
    from django.db import connection

    django_user_model.objects.create_user(email="kept@x.test", password="x", full_name_ar="باقٍ")
    stamp = _copy()
    assert backups.info(stamp)["counts"]["users"] == 1
    django_user_model.objects.create_user(email="later@x.test", password="x", full_name_ar="لاحق")
    with connection.cursor() as cursor:
        cursor.execute("create table added_by_a_later_migration (id int)")
    try:
        result = restore.run(stamp, None, "admin@x.test")
        assert result["state"] == "done", result
        assert list(django_user_model.objects.values_list("email", flat=True)) == ["kept@x.test"]
        with connection.cursor() as cursor:
            cursor.execute(
                "select count(*) from information_schema.tables "
                "where table_name = 'added_by_a_later_migration'"
            )
            assert cursor.fetchone()[0] == 0
        from audit.models import AuditLog

        assert AuditLog.objects.filter(action="backup.restore", target_id=stamp).exists()
        # A copy from another engine or newer code is stopped by the real check too.
        restore.check_dump  # noqa: B018  (ran inside restore.run above, on a real pg_dump)
    finally:
        with connection.cursor() as cursor:
            cursor.execute("drop table if exists added_by_a_later_migration")


def test_the_platform_is_closed_only_while_maintenance_is_held(api, make_user, settings):
    from accounts.rbac import Role

    client = api(make_user(Role.SYSTEM_ADMIN))
    assert client.get("/api/v1/me").status_code == 200
    assert client.get("/api/public/maintenance").data == {"maintenance": False}
    with maintenance.held("restore"):
        closed = client.get("/api/v1/me")
        assert closed.status_code == 503 and closed.json()["code"] == "maintenance"
        assert closed["Retry-After"] == "60"
        assert client.post("/api/v1/backups", {}, format="json").status_code == 503
        assert api().post("/api/public/password/forgot", {}, format="json").status_code == 503
        # Monitoring and the waiting screen still get their answers.
        assert client.get("/api/public/health").status_code == 200
        assert api().get("/api/public/maintenance").data == {"maintenance": True}
    assert client.get("/api/v1/me").status_code == 200
