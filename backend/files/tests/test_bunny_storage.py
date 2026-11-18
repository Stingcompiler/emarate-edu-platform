"""Every uploaded file moves to Bunny (owner, 2026-11-16): the server's files are copied to the
private and public zones under the same names, again and again without sending twice; the
backups stay on the server's disk; a deleted video leaves Bunny Stream too."""

import io
import json
import tarfile
from urllib.parse import unquote, urlparse

import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage

from files import bunny, move

pytestmark = pytest.mark.django_db


class FakeBunny:
    """Storage zones and Stream, as Bunny's HTTP API answers them."""

    def __init__(self):
        self.zones: dict[str, dict[str, bytes]] = {}
        self.calls: list[tuple[str, str]] = []

    def __call__(self, method, url, *, headers, data=None):
        self.calls.append((method, url))
        parts = urlparse(url)
        if parts.netloc == "video.bunnycdn.com":
            return b"{}"
        zone, _, path = unquote(parts.path).lstrip("/").partition("/")
        files = self.zones.setdefault(zone, {})
        assert headers["AccessKey"] == f"key-{zone}"
        if method == "PUT":
            body = data if isinstance(data, bytes) else data.read()
            files[path] = body
            return b""
        if method == "DELETE":
            files.pop(path, None)
            return b""
        if path == "" or path.endswith("/"):
            entries, folders = [], set()
            for name, body in files.items():
                if not name.startswith(path):
                    continue
                rest = name[len(path) :]
                if "/" in rest:
                    folders.add(rest.split("/", 1)[0])
                else:
                    entries.append({"ObjectName": rest, "IsDirectory": False, "Length": len(body)})
            entries += [{"ObjectName": f, "IsDirectory": True, "Length": 0} for f in folders]
            return json.dumps(entries).encode()
        return files[path]


@pytest.fixture
def fake(monkeypatch, settings, tmp_path):
    the_bunny = FakeBunny()
    monkeypatch.setattr(bunny, "_request", the_bunny)
    settings.BUNNY_STORAGE_ZONE = "ecst-private"
    settings.BUNNY_STORAGE_KEY = "key-ecst-private"
    settings.BUNNY_PUBLIC_STORAGE_ZONE = "ecst-public"
    settings.BUNNY_PUBLIC_STORAGE_KEY = "key-ecst-public"
    settings.BUNNY_PUBLIC_URL = "https://ecst-public.b-cdn.net"
    settings.BUNNY_STREAM_LIBRARY_ID = "123"
    settings.BUNNY_STREAM_API_KEY = "stream-key"
    root = tmp_path / "media"
    settings.MEDIA_ROOT = root
    (root / "private/submissions").mkdir(parents=True)
    (root / "private/backups").mkdir()
    (root / "private/.replaced-20261101").mkdir()
    (root / "public/site").mkdir(parents=True)
    (root / "private/submissions/a.pdf").write_bytes(b"pdf")
    (root / "private/backups/ecst-1.dump.enc").write_bytes(b"secret dump")
    (root / "private/.replaced-20261101/old.pdf").write_bytes(b"old")
    (root / "public/site/logo.png").write_bytes(b"logo")
    return the_bunny


def test_the_files_go_to_their_zones_under_the_same_names_and_only_once(fake, settings):
    shown = move.move(dry_run=True)
    assert shown["sent"] == 2 and not fake.zones.get("ecst-private")
    done = move.move()
    assert done["sent"] == 2 and done["failed"] == [] and done["missing"] == []
    assert fake.zones["ecst-private"] == {"submissions/a.pdf": b"pdf"}  # not the backups
    assert fake.zones["ecst-public"] == {"site/logo.png": b"logo"}
    # Again: nothing to send. A file that changed is sent again.
    assert move.move()["sent"] == 0
    (settings.MEDIA_ROOT / "public/site/logo.png").write_bytes(b"new logo")
    again = move.move()
    assert again["sent"] == 1 and fake.zones["ecst-public"]["site/logo.png"] == b"new logo"


def test_a_copys_files_are_sent_to_bunny_by_a_restore(fake, tmp_path):
    archive = tmp_path / "media.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for name, body in (("private/old/b.pdf", b"b"), ("public/photo.jpg", b"jpg")):
            info = tarfile.TarInfo(name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
    sent = move.push_archive(archive)
    assert sent["sent"] == 2
    assert fake.zones["ecst-private"]["old/b.pdf"] == b"b"
    assert fake.zones["ecst-public"]["photo.jpg"] == b"jpg"


def test_the_public_zone_has_addresses_and_the_private_one_only_signed_links(fake):
    zones = move.zones()
    assert zones["public"].url("site/a b.png") == "https://ecst-public.b-cdn.net/site/a%20b.png"
    with pytest.raises(NotImplementedError):
        zones["private"].url("submissions/a.pdf")
    name = zones["private"].save("x/y.txt", ContentFile(b"hello"))
    assert zones["private"].size(name) == 5
    assert zones["private"].open(name).read() == b"hello"


def test_the_backups_stay_on_the_servers_disk_when_the_files_are_on_bunny(fake, settings):
    from core import backups

    settings.MEDIA_BACKEND = "bunny"
    disk = backups.default_storage._target()
    assert isinstance(disk, FileSystemStorage)
    assert disk.location == str(settings.MEDIA_ROOT / "private")
    assert "ecst-1.dump.enc" in disk.listdir("backups")[1]


def test_a_deleted_video_leaves_bunny_stream(fake, make_user, it_offering):
    from files.models import VideoAsset

    def video(provider):
        return VideoAsset.objects.create(
            offering=it_offering,
            title="درس",
            provider=provider,
            provider_id="guid-1" if provider == "bunny" else "",
            uploaded_by=make_user(),
        )

    def removed():
        return [c for c in fake.calls if c[0] == "DELETE" and "videos/guid-1" in c[1]]

    from django.test import TestCase

    local = video("local")
    with TestCase.captureOnCommitCallbacks(execute=True):
        local.delete()
    assert not removed()
    on_stream = video("bunny")
    with TestCase.captureOnCommitCallbacks(execute=True):
        on_stream.delete()
    assert removed()


def test_without_a_stream_library_a_video_is_a_file_in_the_private_zone(
    fake, settings, api, classroom
):
    """Owner, 2026-11-16: «الفيديوهات تبقى على bunny storage»."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    from files.models import VideoAsset

    settings.MEDIA_BACKEND = "bunny"
    settings.BUNNY_STREAM_LIBRARY_ID = ""
    settings.BUNNY_PULL_ZONE_URL = "https://ecst-files.b-cdn.net"
    settings.BUNNY_TOKEN_KEY = "token-key"
    settings.STORAGES = {**settings.STORAGES, "default": {"BACKEND": "files.bunny.BunnyStorage"}}
    teacher = api(classroom.teacher)
    made = teacher.post(
        "/api/v1/videos/upload-ticket",
        {"offering": classroom.offering.pk, "title": "المحاضرة 1", "size": 12},
    ).data
    assert made["ticket"]["mode"] == "local"  # through the platform, not to Stream
    assert not [c for c in fake.calls if "video.bunnycdn.com" in c[1]]
    from django.test import TestCase

    body = b"\x00\x00\x00\x18ftypmp42"
    with TestCase.captureOnCommitCallbacks() as later:
        sent = teacher.post(
            made["ticket"]["upload_url"],
            {"file": SimpleUploadedFile("lecture.mp4", body)},
            format="multipart",
        )
    assert sent.status_code == 200, sent.data
    video = VideoAsset.objects.get()
    assert video.provider == "local"
    # Not sent to Bunny inside the upload's request: it waits on the disk for the worker.
    assert video.status == "processing" and not fake.zones.get("ecst-private")
    on_disk = settings.MEDIA_ROOT / "private" / video.file.name
    assert on_disk.read_bytes() == body
    assert teacher.get(f"/api/v1/videos/{video.public_id}/playback").status_code == 400
    for callback in later:
        callback()
    video.refresh_from_db()
    assert video.status == "ready" and fake.zones["ecst-private"][video.file.name] == body
    assert not on_disk.exists()
    link = teacher.get(f"/api/v1/videos/{video.public_id}/playback").data["url"]
    assert link.startswith("https://ecst-files.b-cdn.net/") and "token=" in link


def test_two_files_of_the_same_name_stay_two_files(fake):
    """Review 2026-11-16: a PUT replaces what is there, so every new name is unique."""
    private = move.zones()["private"]
    first = private.save("videos/2026/11/lecture.mp4", ContentFile(b"one"))
    second = private.save("videos/2026/11/lecture.mp4", ContentFile(b"two"))
    assert first != second
    assert first.startswith("videos/2026/11/lecture-") and first.endswith(".mp4")
    assert fake.zones["ecst-private"][first] == b"one"
    assert fake.zones["ecst-private"][second] == b"two"
    assert len(private.get_available_name("a/" + "x" * 300 + ".pdf", max_length=100)) <= 100


def test_on_bunny_a_deleted_file_waits_as_long_as_the_copies_are_kept(fake, settings):
    """Review 2026-11-16: the backups hold no files on Bunny, so a restored copy must still
    find them — a deleted file leaves the zone only after FILES_KEEP_DELETED_DAYS."""
    from datetime import timedelta

    from django.utils import timezone

    from files import trash
    from files.models import DiscardedFile

    settings.MEDIA_BACKEND = "bunny"
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {"BACKEND": "files.bunny.BunnyStorage"},
    }
    fake.zones["ecst-private"] = {"submissions/a.pdf": b"pdf"}
    trash.discard(["submissions/a.pdf"])
    assert fake.zones["ecst-private"] == {"submissions/a.pdf": b"pdf"}
    waiting = DiscardedFile.objects.get()
    assert waiting.due > timezone.now() + timedelta(days=settings.FILES_KEEP_DELETED_DAYS - 1)
    assert trash.purge() == {"removed": 0, "failed": 0}
    DiscardedFile.objects.update(due=timezone.now())
    assert trash.purge() == {"removed": 1, "failed": 0}
    assert fake.zones["ecst-private"] == {} and not DiscardedFile.objects.exists()


def test_on_the_servers_disk_a_deleted_file_goes_at_once(settings, tmp_path):
    from files import trash
    from files.models import DiscardedFile

    settings.MEDIA_BACKEND = "local"
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": tmp_path},
        },
    }
    (tmp_path / "a.pdf").write_bytes(b"pdf")
    trash.discard("a.pdf")
    assert not (tmp_path / "a.pdf").exists() and not DiscardedFile.objects.exists()


def test_a_video_whose_sending_was_lost_is_sent_again(fake, settings, api, classroom):
    """Review 2026-11-18: a worker restarted mid-send (every deploy) loses its task; the sweep
    queues the video again an hour after its upload, unless a send is still going."""
    from datetime import timedelta

    from django.core.cache import cache
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.test import TestCase
    from django.utils import timezone

    from files import services
    from files.models import VideoAsset

    settings.MEDIA_BACKEND = "bunny"
    settings.BUNNY_STREAM_LIBRARY_ID = ""
    settings.STORAGES = {**settings.STORAGES, "default": {"BACKEND": "files.bunny.BunnyStorage"}}
    teacher = api(classroom.teacher)
    made = teacher.post(
        "/api/v1/videos/upload-ticket",
        {"offering": classroom.offering.pk, "title": "المحاضرة 1", "size": 12},
    ).data
    with TestCase.captureOnCommitCallbacks():  # the task is lost: never run
        teacher.post(
            made["ticket"]["upload_url"],
            {"file": SimpleUploadedFile("lecture.mp4", b"video bytes")},
            format="multipart",
        )
    video = VideoAsset.objects.get()
    assert video.status == "processing"
    assert services.resume_stuck_videos() == 0  # too soon: its own task may still be going
    VideoAsset.objects.update(updated_at=timezone.now() - timedelta(hours=2))
    cache.add(f"video-send:{video.pk}", 1)  # a send still going
    assert services.resume_stuck_videos() == 0
    cache.delete(f"video-send:{video.pk}")
    assert services.resume_stuck_videos() == 1  # eager in the tests: sent at once
    video.refresh_from_db()
    assert video.status == "ready" and fake.zones["ecst-private"][video.file.name] == b"video bytes"
    assert services.resume_stuck_videos() == 0


def test_a_folder_or_an_empty_name_is_never_deleted_on_bunny(fake, settings):
    """Review 2026-11-18: a DELETE on «» or a folder would take the whole zone with it."""
    from files import trash
    from files.models import DiscardedFile

    private = move.zones()["private"]
    for name in ("", "/", "submissions/"):
        with pytest.raises(ValueError):
            private.delete(name)
    assert not [c for c in fake.calls if c[0] == "DELETE"]
    settings.MEDIA_BACKEND = "bunny"
    trash.discard("")
    trash.discard(["", "/", "a.pdf"])
    assert list(DiscardedFile.objects.values_list("name", flat=True)) == ["a.pdf"]


def test_uploads_nobody_finished_leave_the_disk_after_a_day(settings, tmp_path):
    import os
    import time

    from files import trash

    settings.FILE_UPLOAD_TEMP_DIR = str(tmp_path)
    old, fresh = tmp_path / "tmpa.upload.mp4", tmp_path / "tmpb.upload.mp4"
    old.write_bytes(b"cut off")
    fresh.write_bytes(b"arriving")
    os.utime(old, (time.time() - 2 * 86400,) * 2)
    assert trash.purge_unfinished_uploads() == 1
    assert not old.exists() and fresh.exists()
