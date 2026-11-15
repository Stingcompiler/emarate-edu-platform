"""Throwaway review probes (never commit). Each asserts the CORRECT behaviour, so it fails
while the defect exists."""

import io
import os
import tarfile
import time
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.utils import timezone

from core import backups, maintenance, restore
from core.tasks import RUNNING
from core.tests.test_restore import _copy, _later, _postgres_tools_match, fake_database, place  # noqa: F401


# ─── B1: the daily timer ignores the restore / «create now» lock ─────────────────────────


def test_p1_timer_backup_waits_while_a_restore_runs(place, fake_database, db):  # noqa: F811
    _copy()
    before = len(backups.existing())
    cache.set(RUNNING, 1, timeout=60)  # a restore (or a portal copy) is in progress
    with maintenance.held("restore"):
        try:
            call_command("backup_database")
        except Exception:
            pass
    assert len(backups.existing()) == before, "the timer made a copy in the middle of a restore"


def test_p2_timer_prune_during_restore_silently_drops_the_files(
    place, fake_database, db, monkeypatch  # noqa: F811
):
    """The copy being restored is the oldest kept one; the 03:15 timer finishes while the
    restore is still decrypting it and prunes it. The restore reports «done» with the
    database of the copy and the files of the present."""
    stamp = _copy()
    _later(place)
    real = backups.decrypt_to
    fired = []

    def decrypt_then_timer(name, out):
        real(name, out)
        if name.endswith(backups.DB_SUFFIX) and not fired:
            fired.append(1)
            time.sleep(1.1)
            call_command("backup_database", keep=1)  # the timer, BACKUP_KEEP reached

    monkeypatch.setattr(backups, "decrypt_to", decrypt_then_timer)
    result = restore.run(stamp)
    if result["state"] == "done":
        assert (place / "public/logo.png").read_bytes() == b"logo-then", (
            "restore said done, but the files are the present's, not the copy's"
        )


def test_p3_two_copies_in_the_same_second_stay_two_restorable_copies(
    place, fake_database, db, monkeypatch, api, make_user  # noqa: F811
):
    """Timer and portal (or a restore's safety copy) start in the same second: both pass the
    `exists` loop before either saves."""
    from accounts.rbac import Role

    fixed = backups.datetime.now(backups.UTC).replace(microsecond=0)

    class Clock:
        @staticmethod
        def now(tz):
            return fixed

    monkeypatch.setattr(backups, "datetime", Clock)
    first = backups.create(keep=0)
    real_exists = backups.default_storage.exists
    calls = []

    def raced(name):  # only the stamp loop in create() sees the other process's save late
        calls.append(name)
        return False if len(calls) == 1 else real_exists(name)

    monkeypatch.setattr(backups.default_storage, "exists", raced)
    second = backups.create(keep=0)
    monkeypatch.setattr(backups.default_storage, "exists", real_exists)
    assert first != second
    data = api(make_user(Role.SYSTEM_ADMIN)).get("/api/v1/backups").data
    assert len(data["copies"]) == 2, (second, [i["name"] for i in data["items"]])


# ─── B2: a restore interrupted (worker killed) locks the page for 30 days ───────────────


def test_p4_a_restore_whose_worker_died_is_not_shown_running_forever(api, make_user, db):
    from accounts.rbac import Role

    restore._say(
        state="running",
        stamp="20261101T031500Z",
        step="database",
        started=(timezone.now() - timedelta(days=2)).isoformat(),
        finished=None,
        error="",
        code="",
        kept_before="20261114T031500Z",
        source="kept",
    )
    cache.delete(RUNNING)  # the server's own switch expired long ago
    assert maintenance.state() is None
    data = api(make_user(Role.SYSTEM_ADMIN)).get("/api/v1/backups").data
    assert data["restore"]["state"] not in ("queued", "running"), data["restore"]


# ─── B3: a finished upload that is never restored stays on disk ─────────────────────────


def test_p5_a_finished_upload_never_restored_is_purged_by_something_periodic(
    place, fake_database, db, settings, tmp_path  # noqa: F811
):
    settings.BACKUP_UPLOAD_DIR = str(tmp_path / "uploads")
    part = restore.upload_dir() / "abandoned.part"
    part.write_bytes(b"ECSTPKG1 a whole college")
    old = time.time() - 3 * 86400
    os.utime(part, (old, old))
    call_command("backup_database")  # the daily job: the only thing that surely runs
    assert not part.exists(), "a whole college lies in uploads/ until someone uploads again"


# ─── B4: upload chunk of the real size the portal sends ─────────────────────────────────


def test_p6_a_chunk_of_the_size_the_portal_sends_is_accepted(
    api, make_user, settings, tmp_path, db
):
    from accounts.rbac import Role

    settings.BACKUP_UPLOAD_DIR = str(tmp_path / "uploads")
    client = api(make_user(Role.SYSTEM_ADMIN))
    started = client.post("/api/v1/backups/uploads", {"size": 8 * 1024 * 1024}, format="json")
    assert started.status_code == 201, started.data
    chunk = started.data["chunk"]
    sent = client.put(
        f"/api/v1/backups/uploads/{started.data['id']}?offset=0",
        b"x" * chunk,
        content_type="application/octet-stream",
    )
    assert sent.status_code == 200, (sent.status_code, getattr(sent, "data", None))


# ─── B5: symlinks inside an archive survive filter="data" and land in public/ ──────────


def test_p7_an_archive_symlink_from_public_into_private_is_refused(place, tmp_path):  # noqa: F811
    hostile = tmp_path / "links.tar.gz"
    with tarfile.open(hostile, mode="w:gz") as tar:
        entry = tarfile.TarInfo("private/submissions/secret.pdf")
        data = b"secret"
        entry.size = len(data)
        tar.addfile(entry, io.BytesIO(data))
        link = tarfile.TarInfo("public/leak.pdf")
        link.type = tarfile.SYMTYPE
        link.linkname = "../private/submissions/secret.pdf"
        tar.addfile(link)
    try:
        staging = restore.stage_files(hostile, place)
    except tarfile.TarError:
        return
    restore.swap_files(staging, place)
    leak = place / "public/leak.pdf"
    assert not leak.is_symlink(), f"public/leak.pdf -> {os.readlink(leak)} reads {leak.read_bytes()}"


# ─── B6: tokens survive a restore and follow a reused user id (PostgreSQL, real) ───────


@pytest.mark.django_db(transaction=True)
def test_p8_a_token_of_a_user_the_restore_removed_does_not_open_a_new_account(
    place, django_user_model  # noqa: F811
):
    if not _postgres_tools_match():
        pytest.skip("needs PostgreSQL and matching client tools")
    from rest_framework.test import APIClient

    from accounts import services

    django_user_model.objects.create_user(email="kept@x.test", password="x", full_name_ar="باقٍ")
    stamp = _copy()
    later = django_user_model.objects.create_user(
        email="later@x.test", password="x", full_name_ar="لاحق"
    )
    tokens = services.issue_tokens(later)
    result = restore.run(stamp, None, "admin@x.test")
    assert result["state"] == "done", result
    fresh = django_user_model.objects.create_user(
        email="fresh@x.test", password="y", full_name_ar="جديد"
    )
    client = APIClient()
    client.cookies["access"] = str(tokens.access_token)
    me = client.get("/api/v1/me")
    assert me.status_code == 401, (
        f"later's token (id {later.pk}) opened {me.json().get('email')} (id {fresh.pk})"
    )
