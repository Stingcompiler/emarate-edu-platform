"""Review 2026-11-15, fix 1 (R115–R121, R125): what a restore must not do to the platform
around it — let an old session in, lose its copy to the daily timer, share a name, lock the
page for a month, open the platform half-restored, or run beside writes it does not see."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.utils import timezone

from accounts.rbac import Role
from core import backups, maintenance, restore
from core.tasks import RUNNING
from core.tests.test_restore import (  # noqa: F401
    _copy,
    _later,
    _postgres_tools_match,
    fake_database,
    place,
)

# ─── One lock, owned (R116–R118, R125) ──────────────────────────────────────────────────


def test_the_daily_timer_waits_for_a_restore_and_never_prunes_its_copy(
    place,  # noqa: F811
    fake_database,  # noqa: F811
    db,
):
    _copy()
    before = backups.existing()
    with backups.holding("restore"), pytest.raises(CommandError):
        call_command("backup_database", keep=1, wait=0)
    assert backups.existing() == before  # nothing made, nothing pruned
    call_command("backup_database", keep=1, wait=0)  # free again: the timer works
    assert len(backups.existing()) == 1
    assert cache.get(RUNNING) is None


def test_the_restore_task_holds_the_lock_the_page_took(monkeypatch, db):
    from core.tasks import restore_backup

    seen = []
    monkeypatch.setattr(
        restore, "run", lambda *a, **k: seen.append(backups.lock_holder()) or {"state": "done"}
    )
    token = backups.lock_take("restore", backups.QUEUED_LEASE)
    restore_backup("20261101T031500Z", lock=token)
    assert seen[0]["token"] == token and seen[0]["purpose"] == "restore"
    assert backups.lock_holder() is None  # let go at the end
    # A lock someone else holds by then: the task does nothing and says so.
    other = backups.lock_take("timer")
    result = restore_backup("20261101T031500Z", lock=token)
    assert result["code"] == "interrupted" and len(seen) == 1
    assert backups.lock_holder()["token"] == other


def test_only_its_owner_lets_the_lock_go_and_it_is_renewed_while_held(monkeypatch):
    monkeypatch.setattr(backups, "LOCK_BEAT", 0.05)
    first = backups.lock_take("create", lease=1)
    backups.lock_release("not-the-owner")
    assert backups.lock_holder()["token"] == first
    backups.lock_release(first)
    assert backups.lock_holder() is None
    with backups.holding("restore") as token:
        assert backups.lock_take("create") is None
        import time

        time.sleep(0.2)  # renewed meanwhile
        assert backups.lock_holder()["token"] == token
    assert backups.lock_holder() is None


def test_two_copies_started_in_the_same_second_get_two_names(
    place,  # noqa: F811
    fake_database,  # noqa: F811
    db,
    monkeypatch,
    api,
    make_user,
):
    fixed = backups.datetime.now(backups.UTC).replace(microsecond=0)

    class Clock:
        @staticmethod
        def now(tz):
            return fixed

    monkeypatch.setattr(backups, "datetime", Clock)
    first = backups.create(keep=0)
    real_exists = backups.default_storage.exists
    calls = []

    def late(name):  # the other process has not saved its copy yet
        calls.append(name)
        return False if len(calls) == 1 else real_exists(name)

    monkeypatch.setattr(backups.default_storage, "exists", late)
    second = backups.create(keep=0)
    monkeypatch.setattr(backups.default_storage, "exists", real_exists)
    assert first != second
    data = api(make_user(Role.SYSTEM_ADMIN)).get("/api/v1/backups").data
    assert len(data["copies"]) == 2


def test_a_copy_being_downloaded_is_not_pruned(place, fake_database, db):  # noqa: F811
    oldest = _copy()
    backups.reading(oldest)
    _copy()
    _copy()
    assert backups.names_of(oldest)["database"] not in backups.prune(1)
    assert backups.names_of(oldest)["database"] in backups.existing()
    backups.done_reading(oldest)
    backups.prune(1)
    assert backups.names_of(oldest)["database"] not in backups.existing()


def test_a_download_marks_its_copy_until_the_last_byte(
    place,  # noqa: F811
    fake_database,  # noqa: F811
    db,
    api,
    make_user,
):
    from organization import backups as page

    stamp = _copy()
    stream = page._marked(stamp, iter([b"a", b"b"]))
    assert next(stream) == b"a"
    backups.reading(stamp)  # as the view does before the first byte
    assert cache.get(backups.READING.format(stamp))
    assert list(stream) == [b"b"]
    assert cache.get(backups.READING.format(stamp)) is None


# ─── A restore whose worker died (R119) ─────────────────────────────────────────────────


def test_a_restore_whose_worker_died_is_shown_interrupted(api, make_user, db):
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
    client = api(make_user(Role.SYSTEM_ADMIN))
    told = client.get("/api/v1/backups").data["restore"]
    assert told["state"] == "failed" and told["code"] == "interrupted", told
    assert "عامل الخادم" in told["error"]
    # While the worker holds the lock it is still running.
    restore._say(state="running", code="", error="")
    with backups.holding("restore"):
        assert client.get("/api/v1/backups").data["restore"]["state"] == "running"


# ─── Every session ends (R115) ──────────────────────────────────────────────────────────


def test_a_restore_ends_every_session_from_before_it(
    place,  # noqa: F811
    fake_database,  # noqa: F811
    db,
    django_user_model,
):
    from rest_framework.test import APIClient

    from accounts import services

    user = django_user_model.objects.create_user(
        email="kept@x.test", password="x", full_name_ar="باقٍ"
    )
    tokens = services.issue_tokens(user)
    client = APIClient()
    client.cookies["access"] = str(tokens.access_token)
    assert client.get("/api/v1/me").status_code == 200
    result = restore.run(_copy())
    assert result["state"] == "done", result
    assert client.get("/api/v1/me").status_code == 401
    client.cookies["refresh"] = str(tokens)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    # A new sign-in works.
    fresh = APIClient()
    fresh.cookies["access"] = str(services.issue_tokens(user).access_token)
    assert fresh.get("/api/v1/me").status_code == 200


def test_a_new_account_never_takes_a_number_given_before(db, django_user_model):
    from django.db import connection

    first = django_user_model.objects.create_user(email="a@x.test", password="x")
    gone = django_user_model.objects.create_user(email="b@x.test", password="x")
    high = restore.users_high_water()
    assert high >= gone.pk
    gone.delete()
    # The restored rows bring their own, lower, numbering back.
    table = django_user_model._meta.db_table
    with connection.cursor() as cursor:
        if connection.vendor == "postgresql":
            cursor.execute("SELECT setval(pg_get_serial_sequence(%s, 'id'), %s)", [table, first.pk])
        else:
            cursor.execute("UPDATE sqlite_sequence SET seq = %s WHERE name = %s", [first.pk, table])
    restore.end_every_session(high)
    assert django_user_model.objects.create_user(email="c@x.test", password="x").pk > high


@pytest.mark.django_db(transaction=True)
def test_a_token_of_an_account_the_restore_removed_opens_nothing(
    place,  # noqa: F811
    django_user_model,
):
    """The real thing on PostgreSQL: the account made after the copy is gone with it, and its
    token must not open the account that is made next."""
    if not _postgres_tools_match():
        pytest.skip("needs PostgreSQL and client tools no older than the server")
    from rest_framework.test import APIClient

    from accounts import services

    django_user_model.objects.create_user(email="kept@x.test", password="x", full_name_ar="باقٍ")
    stamp = _copy()
    later = django_user_model.objects.create_user(
        email="later@x.test", password="x", full_name_ar="لاحق"
    )
    tokens = services.issue_tokens(later)
    assert restore.run(stamp, None, "admin@x.test")["state"] == "done"
    fresh = django_user_model.objects.create_user(
        email="fresh@x.test", password="y", full_name_ar="جديد"
    )
    assert fresh.pk > later.pk
    client = APIClient()
    client.cookies["access"] = str(tokens.access_token)
    assert client.get("/api/v1/me").status_code == 401


# ─── Writes in flight and the worker's tasks (R121) ─────────────────────────────────────


def test_the_restore_waits_for_writes_already_inside():
    maintenance.writing()
    assert maintenance.drain(0.3, poll=0.05) == 1  # gave up waiting; the count starts again
    assert maintenance.drain(0) == 0
    maintenance.writing()
    maintenance.written()
    assert maintenance.drain(1) == 0


def test_a_request_that_writes_is_counted_while_it_runs(api, make_user, monkeypatch):
    seen = []
    real = maintenance.check
    monkeypatch.setattr(
        maintenance, "check", lambda: seen.append(cache.get(maintenance.WRITES)) or real()
    )
    client = api(make_user(Role.SYSTEM_ADMIN))
    client.post("/api/v1/auth/logout")
    client.get("/api/v1/me")
    assert seen[0] == 1  # the sign-out (a write) was counted; the read after it was not
    assert seen[1] in (0, None)
    assert int(cache.get(maintenance.WRITES) or 0) == 0


def test_the_workers_tasks_do_not_run_while_the_platform_is_restored():
    from config.celery import app

    @app.task(name="tests.restore_safety.noop")
    def noop():
        return "ran"

    assert noop() == "ran"
    with maintenance.held("restore"):
        assert noop() is None
        assert noop.apply().get() == "ran"  # inline (development, tests): it runs
        from core.tasks import ping

        assert ping() == "pong"  # the restore's own and the copies' are never put off
