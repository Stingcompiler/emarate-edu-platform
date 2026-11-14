"""«النسخ الاحتياطية» on the system admin's settings: the list and a copy made now by the worker
(owner, 2026-11-05); a copy downloaded as one file under its own password, and one restored
over the platform (owner, 2026-11-14; the restore itself is in test_restore.py)."""

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


# ─── «استعادة» (owner, 2026-11-14) ──────────────────────────────────────────────────────

RESTORE = "/api/v1/backups/restore"


@pytest.fixture
def restores(monkeypatch):
    """The engine is stood in for (test_restore.py runs it): what the page asks of it."""
    from core import restore

    asked = []

    def run(stamp, actor_id=None, actor_email=""):
        asked.append((stamp, actor_id, actor_email))
        state = {**cache.get(restore.STATE), "state": "done", "kept_before": "20261114T040000Z"}
        cache.set(restore.STATE, state)
        return state

    monkeypatch.setattr(restore, "run", run)
    monkeypatch.setattr(restore, "missing_tools", lambda: [])
    cache.delete(restore.STATE)
    return asked


def _restore(client, **changes):
    return client.post(RESTORE, {"stamp": STAMP, "password": PASSWORD, **changes}, format="json")


def test_the_admin_restores_a_kept_copy(
    api, make_user, copy, restores, django_capture_on_commit_callbacks
):
    admin = make_user(Role.SYSTEM_ADMIN)
    client = api(admin)
    assert client.get(URL).data["restore"] is None
    with django_capture_on_commit_callbacks(execute=True):
        response = _restore(client)
    assert response.status_code == 202 and response.data["state"] == "queued", response.data
    # Asked of the worker once this request's own writes were committed.
    assert restores == [(STAMP, admin.pk, admin.email)]
    assert AuditLog.objects.filter(action="backup.restore_request", actor=admin).exists()
    told = client.get(URL).data["restore"]
    assert told["state"] == "done" and told["stamp"] == STAMP
    assert told["kept_before"] == "20261114T040000Z"
    assert not cache.get(RUNNING)  # a copy can be made again


def test_a_restore_needs_the_admins_own_password_and_a_kept_copy(
    api, make_user, copy, restores, django_capture_on_commit_callbacks
):
    client = api(make_user(Role.SYSTEM_ADMIN))
    with django_capture_on_commit_callbacks(execute=True):
        wrong = _restore(client, password="not-mine")
        assert wrong.status_code == 400 and wrong.data["code"] == "wrong_password"
        assert _restore(client, stamp="20000101T000000Z").status_code == 404
        assert _restore(client, stamp="../../env").status_code == 400
        cache.set(RUNNING, 1, timeout=60)  # a copy is being made
        busy = _restore(client)
        assert busy.status_code == 409 and busy.data["code"] == "running"
    assert restores == [] and not AuditLog.objects.filter(action="backup.restore_request")


def test_a_server_without_the_database_tools_says_so(api, make_user, copy, restores, monkeypatch):
    from core import restore

    monkeypatch.setattr(restore, "missing_tools", lambda: ["psql"])
    response = _restore(api(make_user(Role.SYSTEM_ADMIN)))
    assert response.status_code == 409 and response.data["code"] == "no_tools"
    assert "psql" in response.data["detail"] and restores == []


def test_only_the_system_admin_restores(
    api, users, copy, restores, django_capture_on_commit_callbacks
):
    """docs/roles-matrix.md `backups.restore`: not the system supervisor."""
    for role in Role:
        if role != Role.SYSTEM_ADMIN:
            assert _restore(api(users[role])).status_code == 403, role
    assert api().post(RESTORE, {}, format="json").status_code == 401
    assert restores == [] and cache.get(RUNNING) is None
    with django_capture_on_commit_callbacks(execute=True):
        assert _restore(api(users[Role.SYSTEM_ADMIN])).status_code == 202
    assert len(restores) == 1


# ─── «استعادة من ملف» on an empty platform (owner, 2026-11-14) ──────────────────────────

UPLOADS = "/api/v1/backups/uploads"


@pytest.fixture
def packed(copy, settings, tmp_path):
    """The file an admin downloaded from another installation, and a folder for uploads."""
    settings.BACKUP_UPLOAD_DIR = str(tmp_path / "uploads")
    return b"".join(backups.package(copy, backups.package_key(FILE_PHRASE)))


def _send(client, data, chunk=700):
    """Upload ``data`` in chunks, as the portal does; the upload's id."""
    started = client.post(UPLOADS, {"size": len(data)}, format="json")
    assert started.status_code == 201, started.data
    upload = started.data["id"]
    for at in range(0, len(data), chunk):
        sent = client.put(
            f"{UPLOADS}/{upload}?offset={at}",
            data[at : at + chunk],
            content_type="application/octet-stream",
        )
        assert sent.status_code == 200, sent.data
    assert sent.data["received"] == len(data)
    return upload


def _restore_file(client, upload, **changes):
    body = {"password": PASSWORD, "file_password": FILE_PHRASE, **changes}
    return client.post(f"{UPLOADS}/{upload}/restore", body, format="json")


def test_an_empty_platform_takes_a_file_from_another_installation(
    api, make_user, packed, restores, monkeypatch, django_capture_on_commit_callbacks
):
    from core import restore

    seen = {}

    def run(stamp, actor_id=None, actor_email="", *, upload=None, key=None):
        seen.update(stamp=stamp, email=actor_email, upload=upload, key=key)
        seen["opens"] = backups.read_package(upload.open("rb"), key=key)["stamp"]
        return {**cache.get(restore.STATE), "state": "done"}

    monkeypatch.setattr(restore, "run", run)
    admin = make_user(Role.SYSTEM_ADMIN)
    client = api(admin)
    assert client.get(URL).data["empty"] is True
    upload = _send(client, packed)
    with django_capture_on_commit_callbacks(execute=True):
        response = _restore_file(client, upload)
    assert response.status_code == 202, response.data
    assert response.data["source"] == "file" and response.data["stamp"] == STAMP
    # The worker was handed the file and the key its password made — never the password.
    assert seen["stamp"] == STAMP and seen["email"] == admin.email
    assert seen["opens"] == STAMP and FILE_PHRASE not in str(seen["key"])
    entry = AuditLog.objects.get(action="backup.restore_request")
    assert entry.new == {"backup": STAMP, "source": "file"}
    # The link to the upload is used up.
    assert (
        client.put(
            f"{UPLOADS}/{upload}?offset=0", b"x", content_type="application/octet-stream"
        ).status_code
        == 404
    )


def test_a_chunk_out_of_place_is_not_written(api, make_user, packed, restores):
    client = api(make_user(Role.SYSTEM_ADMIN))
    upload = client.post(UPLOADS, {"size": len(packed)}, format="json").data["id"]
    octet = {"content_type": "application/octet-stream"}
    assert client.put(f"{UPLOADS}/{upload}?offset=0", packed[:500], **octet).status_code == 200
    # The same chunk again (its answer was lost on the way): nothing doubled, and the answer
    # says where to go on from.
    again = client.put(f"{UPLOADS}/{upload}?offset=0", packed[:500], **octet)
    assert again.status_code == 409 and again.data["received"] == 500
    skipped = client.put(f"{UPLOADS}/{upload}?offset=900", packed[900:], **octet)
    assert skipped.status_code == 409 and skipped.data["received"] == 500
    # More than the file was said to be.
    over = client.put(f"{UPLOADS}/{upload}?offset=500", packed[500:] + b"extra", **octet)
    assert over.status_code == 409
    # Asked to restore before it has all arrived.
    early = _restore_file(client, upload)
    assert early.status_code == 409 and early.data["code"] == "incomplete"
    assert client.put(f"{UPLOADS}/{upload}?offset=500", packed[500:], **octet).status_code == 200
    assert restores == []


def test_the_file_needs_its_own_password_and_must_be_a_backup(
    api, make_user, packed, restores, django_capture_on_commit_callbacks
):
    client = api(make_user(Role.SYSTEM_ADMIN))
    upload = _send(client, packed)
    with django_capture_on_commit_callbacks(execute=True):
        mine = _restore_file(client, upload, password="not-mine")
        assert mine.status_code == 400 and mine.data["code"] == "wrong_password"
        wrong = _restore_file(client, upload, file_password="another-password")
        assert wrong.status_code == 400 and wrong.data["code"] == "wrong_file_password"
        # The file stays for another try with the right password…
        assert _restore_file(client, upload).status_code == 202
        # …but something that is not a backup is thrown away at once.
        other = _send(client, b"PK\x03\x04 a spreadsheet, not a backup" * 40)
        refused = _restore_file(client, other)
        assert refused.status_code == 400 and refused.data["code"] == "not_a_backup"
        assert _restore_file(client, other).status_code == 404


def test_a_platform_with_students_takes_no_uploaded_file(
    api, make_user, make_student, it_program, packed, restores
):
    client = api(make_user(Role.SYSTEM_ADMIN))
    upload = _send(client, packed)  # sent while the platform was still empty
    make_student(it_program, "26-IT-0001")
    assert client.get(URL).data["empty"] is False
    started = client.post(UPLOADS, {"size": 10}, format="json")
    assert started.status_code == 409 and started.data["code"] == "not_empty"
    late = _restore_file(client, upload)
    assert late.status_code == 409 and late.data["code"] == "not_empty"
    assert restores == []


def test_only_the_system_admin_uploads_a_backup(api, users, packed, restores):
    """docs/roles-matrix.md `backups.restore`, for the three upload endpoints."""
    mine = _send(api(users[Role.SYSTEM_ADMIN]), packed)
    octet = {"content_type": "application/octet-stream"}
    for role in Role:
        if role == Role.SYSTEM_ADMIN:
            continue
        client = api(users[role])
        assert client.post(UPLOADS, {"size": 10}, format="json").status_code == 403, role
        assert client.put(f"{UPLOADS}/{mine}?offset=0", b"x", **octet).status_code == 403, role
        assert _restore_file(client, mine).status_code == 403, role
    assert api().post(UPLOADS, {"size": 10}, format="json").status_code == 401
    # Another admin's upload is not this admin's.
    from accounts.models import User

    other = User.objects.create_user(email="other@x.test", password=PASSWORD, full_name_ar="آخر")
    from accounts.models import RoleAssignment

    RoleAssignment.objects.create(user=other, role=Role.SYSTEM_ADMIN)
    assert _restore_file(api(other), mine).status_code == 404
