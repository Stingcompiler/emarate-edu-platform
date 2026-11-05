"""«النسخ الاحتياطية» on the system admin's settings (owner, 2026-11-05): the list, and a copy
made now by the worker; restoring is not offered from the web (docs/runbook.md §5)."""

import pytest
from django.core.cache import cache

from accounts.rbac import Role
from audit.models import AuditLog
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
