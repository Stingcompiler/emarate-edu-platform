"""A copy of every backup off the server, on Cloudflare R2 (owner, 2026-11-16; core.offsite).
The bucket is stood in for by a dictionary: the S3 calls the module makes, and nothing else."""

# ruff: noqa: F811  (fixtures imported by name)

import pytest

from core import backups, offsite
from core.tests.test_restore import _copy, fake_database, place  # noqa: F401

pytestmark = pytest.mark.django_db


class FakeBucket:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.fail = False

    def get_paginator(self, name):
        bucket = self

        class Pages:
            def paginate(self, Bucket, Prefix):
                if bucket.fail:
                    raise ConnectionError("R2 is unreachable")
                keys = [k for k in bucket.objects if k.startswith(Prefix)]
                return [{"Contents": [{"Key": k} for k in keys]}] if keys else [{}]

        return Pages()

    def upload_fileobj(self, handle, bucket, key):
        self.objects[key] = handle.read()

    def delete_object(self, Bucket, Key):
        del self.objects[Key]


@pytest.fixture
def bucket(settings, monkeypatch):
    settings.OFFSITE_BACKUP_ENDPOINT = "https://account.r2.example"
    settings.OFFSITE_BACKUP_BUCKET = "ecst-backup"
    settings.OFFSITE_BACKUP_ACCESS_KEY_ID = "id"
    settings.OFFSITE_BACKUP_SECRET_ACCESS_KEY = "secret"
    settings.OFFSITE_BACKUP_KEEP = 2
    fake = FakeBucket()
    monkeypatch.setattr(offsite, "_client", lambda: fake)
    return fake


def _stamps(fake) -> set[str]:
    return {offsite._stamp(k) for k in fake.objects}


def test_nothing_happens_until_it_is_set_up(place, fake_database, settings, monkeypatch):
    settings.OFFSITE_BACKUP_BUCKET = ""
    monkeypatch.setattr(offsite, "_client", lambda: pytest.fail("no bucket was set up"))
    _copy()
    assert offsite.sync() == {"configured": False}


def test_every_backup_goes_off_the_server_as_it_is_and_the_bucket_keeps_its_number(
    place, fake_database, bucket
):
    first = _copy()  # the copy itself asks for the sync (the worker runs inline in tests)
    name = backups.names_of(first)["database"]
    with backups.default_storage.open(name, "rb") as handle:
        assert bucket.objects[f"backups/{name.rsplit('/', 1)[-1]}"] == handle.read()  # encrypted
    assert all(k.endswith((".enc",)) for k in bucket.objects)
    second, third = _copy(), _copy()
    assert _stamps(bucket) == {second, third}  # the oldest left the bucket (keep 2)
    status = offsite.sync()
    assert status["ok"] is True and status["uploaded"] == 0 and status["newest"] == third


def test_a_failed_copy_is_reported_and_tried_again(
    place, fake_database, bucket, monkeypatch, api, make_user
):
    from accounts.rbac import Role
    from core.tasks import sync_offsite_backups

    alerts = []
    monkeypatch.setattr(
        "django.core.management.call_command", lambda *a, **k: alerts.append(k.get("unit"))
    )
    bucket.fail = True
    stamp = _copy()
    assert alerts == ["ecst-offsite-backup"]
    shown = api(make_user(Role.SYSTEM_ADMIN)).get("/api/v1/backups").data["offsite"]
    assert shown["configured"] is True and shown["ok"] is False
    bucket.fail = False
    assert sync_offsite_backups()["ok"] is True
    assert stamp in _stamps(bucket)
    shown = api(make_user(Role.SYSTEM_ADMIN)).get("/api/v1/backups").data["offsite"]
    assert shown["ok"] is True and shown["newest"] == stamp and shown["copies"] == 1
