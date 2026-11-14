"""«النسخ الاحتياطية» on the system admin's settings: the list and a copy made now by the worker
(owner, 2026-11-05); a copy downloaded as one file under its own password (owner, 2026-11-14)."""

import io

import pytest
from django.core.cache import cache

from accounts.rbac import Role
from audit.models import AuditLog
from conftest import PASSWORD
from core import backups
from core.tasks import RUNNING

URL = "/api/v1/backups"


@pytest.fixture
def storage(settings, tmp_path):
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(tmp_path)},
        },
    }
    (tmp_path / "backups").mkdir()
    return tmp_path / "backups"


def test_the_list_is_newest_first_with_sizes(api, make_user, storage):
    (storage / "ecst-20261030T031500Z.dump.enc").write_bytes(b"x" * 10)
    (storage / "ecst-20261104T031500Z.dump.enc").write_bytes(b"x" * 20)
    (storage / "ecst-media-20261104T031500Z.tar.gz.enc").write_bytes(b"x" * 30)
    data = api(make_user(Role.SYSTEM_ADMIN)).get(URL).data
    assert [(i["kind"], i["size"]) for i in data["items"]] == [
        ("database", 20),
        ("files", 30),
        ("database", 10),
    ]
    assert data["running"] is False and data["last_failed"] is False


def test_a_copy_now_is_made_once_and_logged(api, make_user, storage, monkeypatch):
    admin = make_user(Role.SYSTEM_ADMIN)
    made = []

    def create(keep):
        made.append(keep)
        name = "backups/ecst-20261105T120000Z.dump.enc"
        (storage / name.split("/")[1]).write_bytes(b"x")
        return [name]

    monkeypatch.setattr(backups, "create", create)
    response = api(admin).post(URL)
    assert response.status_code == 202
    assert made and not cache.get(RUNNING)
    assert AuditLog.objects.filter(action="backup.request", actor=admin).exists()
    assert AuditLog.objects.filter(action="backup.create", actor=admin).exists()
    assert response.data["items"][0]["name"] == "ecst-20261105T120000Z.dump.enc"


def test_one_at_a_time(api, make_user, storage):
    cache.set(RUNNING, 1, timeout=60)
    response = api(make_user(Role.SYSTEM_ADMIN)).post(URL)
    assert response.status_code == 409 and response.data["code"] == "running"


def test_a_failed_copy_says_so(api, make_user, storage, monkeypatch):
    def broken(keep):
        raise RuntimeError("pg_dump failed")

    monkeypatch.setattr(backups, "create", broken)
    client = api(make_user(Role.SYSTEM_ADMIN))
    assert client.post(URL).data["last_failed"] is True
    assert not cache.get(RUNNING)


# ─── «تنزيل» (owner, 2026-11-14) ────────────────────────────────────────────────────────

DOWNLOAD = "/api/v1/backups/download"
STAMP = "20261114T031500Z"
FILE_PHRASE = "a-long-file-password"


@pytest.fixture
def copy(storage, settings, monkeypatch):
    settings.BACKUP_ENCRYPTION_KEY = "offline-backup-secret"
    monkeypatch.setattr(backups, "dump_to", lambda path: path.write_bytes(b"PGDMP-fake-dump"))

    real = backups.datetime

    class Clock:
        @staticmethod
        def now(tz):
            return real(2026, 11, 14, 3, 15, 0, tzinfo=tz)

    monkeypatch.setattr(backups, "datetime", Clock)
    backups.create(keep=8)
    return STAMP


def _ask(client, **changes):
    body = {
        "stamp": STAMP,
        "password": PASSWORD,
        "file_password": "a-long-file-password",
        **changes,
    }
    return client.post(DOWNLOAD, body, format="json")


def test_the_list_groups_a_copy_and_shows_its_numbers(api, make_user, copy):
    data = api(make_user(Role.SYSTEM_ADMIN)).get(URL).data
    (one,) = data["copies"]
    assert one["stamp"] == STAMP and one["files"] is False and one["size"] > 0
    # The admin asking was made after the copy: today's number is one more.
    assert one["counts"]["users"] == 0 and data["now"]["users"] == 1


def test_the_admin_downloads_a_copy_under_its_own_password(api, make_user, copy, mailoutbox):
    admin = make_user(Role.SYSTEM_ADMIN)
    other = make_user(Role.SYSTEM_SUPERVISOR)
    client = api(admin)
    response = _ask(client)
    assert response.status_code == 200, response.data
    assert response.data["filename"] == f"ecst-backup-{STAMP}.ecstbak"
    entry = AuditLog.objects.get(action="backup.download")
    assert entry.actor == admin and entry.new == {"backup": STAMP}
    # Every admin hears of it.
    from notifications.models import Notification

    told = Notification.objects.get(category="ops")
    assert set(told.audience["ids"]) == {str(admin.public_id), str(other.public_id)}

    file = client.get(response.data["url"])
    assert file.status_code == 200
    assert file["Content-Disposition"] == f'attachment; filename="ecst-backup-{STAMP}.ecstbak"'
    packed = b"".join(file.streaming_content)
    assert backups.read_package(io.BytesIO(packed), FILE_PHRASE)["stamp"] == STAMP
    # The link works once.
    assert client.get(response.data["url"]).status_code == 404


def test_a_download_needs_the_admins_own_password_and_a_real_file_password(api, make_user, copy):
    client = api(make_user(Role.SYSTEM_ADMIN))
    wrong = _ask(client, password="not-mine")
    assert wrong.status_code == 400 and wrong.data["code"] == "wrong_password"
    short = _ask(client, file_password="short")
    assert short.status_code == 400 and "file_password" in str(short.data)
    assert _ask(client, stamp="20000101T000000Z").status_code == 404
    assert _ask(client, stamp="../../env").status_code == 400
    assert not AuditLog.objects.filter(action="backup.download").exists()


def test_the_link_is_the_askers_alone(api, make_user, copy):
    url = _ask(api(make_user(Role.SYSTEM_ADMIN))).data["url"]
    assert api(make_user(Role.SYSTEM_ADMIN)).get(url).status_code == 404
    assert api().get(url).status_code == 401
    assert api(make_user(Role.SYSTEM_ADMIN)).get("/api/v1/backups/file/made-up").status_code == 404


def test_only_the_system_admin_downloads(api, users, copy):
    """docs/roles-matrix.md `backups.download`: not the system supervisor, who stands in for
    the admin everywhere else — the file holds every record of the college."""
    for role in Role:
        client = api(users[role])
        expected = 200 if role == Role.SYSTEM_ADMIN else 403
        assert _ask(client).status_code == expected, role
        if role != Role.SYSTEM_ADMIN:
            assert client.get("/api/v1/backups/file/made-up").status_code == 403, role
    assert api().post(DOWNLOAD, {}, format="json").status_code == 401
