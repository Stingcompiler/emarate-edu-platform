"""Uploads, signed links and Bunny integration (Phase 2 acceptance)."""

import base64
import hashlib
import io
import json
import zipfile
from urllib.parse import parse_qs, urlparse

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from files import bunny, validation
from files.models import VideoAsset

BUNNY = {
    "MEDIA_BACKEND": "bunny",
    "BUNNY_STORAGE_ZONE": "ecst-private",
    "BUNNY_STORAGE_KEY": "storage-key",
    "BUNNY_PULL_ZONE_URL": "https://ecst-private.b-cdn.net",
    "BUNNY_TOKEN_KEY": "token-key",
    "BUNNY_STREAM_LIBRARY_ID": "12345",
    "BUNNY_STREAM_API_KEY": "stream-key",
    "BUNNY_STREAM_TOKEN_KEY": "embed-key",
    "BUNNY_WEBHOOK_SECRET": "hook-secret",
}


@pytest.fixture
def bunny_mode(settings, monkeypatch):
    for key, value in BUNNY.items():
        setattr(settings, key, value)
    calls = []

    def fake_request(method, url, *, headers, data=None):
        calls.append({"method": method, "url": url, "headers": headers, "data": data})
        if url.endswith("/videos"):
            return json.dumps({"guid": "vid-guid-1"}).encode()
        return b"stored bytes"

    monkeypatch.setattr(bunny, "_request", fake_request)
    return calls


def test_zip_bombs_are_rejected():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("big.txt", b"0" * (3 * 1024 * 1024))
    upload = SimpleUploadedFile("slides.zip", buffer.getvalue())
    with pytest.raises(validation.UploadError, match="unsafe"):
        validation.check(upload, allowed=None, max_mb=0.1)


def test_size_limit():
    upload = SimpleUploadedFile("a.pdf", b"%PDF-" + b"0" * 2048)
    with pytest.raises(validation.UploadError, match="larger"):
        validation.check(upload, allowed=None, max_mb=0.001)


def test_cdn_token_follows_bunny_scheme(settings):
    for key, value in BUNNY.items():
        setattr(settings, key, value)
    url, expires = bunny.cdn_url("lecture/2026/09/abc.pdf", 600)
    parsed = urlparse(url)
    assert parsed.netloc == "ecst-private.b-cdn.net"
    query = parse_qs(parsed.query)
    assert query["expires"] == [str(expires)]
    digest = hashlib.sha256(f"token-key/lecture/2026/09/abc.pdf{expires}".encode()).digest()
    assert query["token"] == [base64.urlsafe_b64encode(digest).decode().rstrip("=")]


def test_video_goes_straight_to_bunny(api, classroom, bunny_mode):
    size = 500 * 1024 * 1024  # 500 MB: only the size is sent to us, never the bytes
    response = api(classroom.teacher).post(
        "/api/v1/videos/upload-ticket",
        {"offering": classroom.offering.pk, "title": "المحاضرة 1", "size": size},
    )
    assert response.status_code == 201, response.data
    ticket = response.data["ticket"]
    assert ticket["mode"] == "tus"
    assert ticket["endpoint"].startswith("https://video.bunnycdn.com/")
    headers = ticket["headers"]
    expected = hashlib.sha256(
        f"12345stream-key{headers['AuthorizationExpire']}vid-guid-1".encode()
    ).hexdigest()
    assert headers["AuthorizationSignature"] == expected
    assert headers["VideoId"] == "vid-guid-1"
    assert "stream-key" not in json.dumps(ticket)  # the API key itself never leaves the server
    assert bunny_mode[0]["headers"]["AccessKey"] == "stream-key"

    video = VideoAsset.objects.get()
    assert video.provider == "bunny" and video.size == size
    # Local upload is refused for Bunny videos.
    local = api(classroom.teacher).post(
        f"/api/v1/videos/{video.public_id}/upload",
        {"file": SimpleUploadedFile("v.mp4", b"x")},
        format="multipart",
    )
    assert local.status_code == 400

    # Not playable until Bunny reports the encoding finished.
    playback = f"/api/v1/videos/{video.public_id}/playback"
    assert api(classroom.teacher).get(playback).status_code == 400
    hook = "/api/public/webhooks/bunny-stream"
    assert (
        api().post(f"{hook}?secret=wrong", {"VideoGuid": "vid-guid-1", "Status": 3}).status_code
        == 404
    )
    assert (
        api()
        .post(f"{hook}?secret=hook-secret", {"VideoGuid": "vid-guid-1", "Status": 3}, format="json")
        .status_code
        == 200
    )
    link = api(classroom.teacher).get(playback).data["url"]
    assert link.startswith("https://iframe.mediadelivery.net/embed/12345/vid-guid-1?token=")


def test_student_cannot_request_upload_tickets(api, classroom):
    response = api(classroom.student).post(
        "/api/v1/videos/upload-ticket",
        {"offering": classroom.offering.pk, "title": "x", "size": 10},
    )
    assert response.status_code == 403


def test_local_video_flow(api, classroom, client):
    ticket = (
        api(classroom.teacher)
        .post(
            "/api/v1/videos/upload-ticket",
            {"offering": classroom.offering.pk, "title": "المحاضرة 1", "size": 12},
        )
        .data
    )
    assert ticket["ticket"]["mode"] == "local"
    video = ticket["video"]["public_id"]
    uploaded = api(classroom.teacher).post(
        ticket["ticket"]["upload_url"],
        {"file": SimpleUploadedFile("lecture.mp4", b"\x00\x00\x00\x18ftypmp42")},
        format="multipart",
    )
    assert uploaded.status_code == 200, uploaded.data
    assert uploaded.data["status"] == "ready"
    from audit.models import AuditLog

    assert AuditLog.objects.filter(action="video.upload").count() == 1
    # Students reach it only through a published lecture.
    playback = f"/api/v1/videos/{video}/playback"
    assert api(classroom.student).get(playback).status_code == 404
    lecture = (
        api(classroom.teacher)
        .post("/api/v1/lectures", {"offering": classroom.offering.pk, "title_ar": "فيديو"})
        .data["public_id"]
    )
    api(classroom.teacher).post(
        f"/api/v1/lectures/{lecture}/resources", {"kind": "video", "title": "الشرح", "video": video}
    )
    api(classroom.teacher).post(f"/api/v1/lectures/{lecture}/publish")
    link = api(classroom.student).get(playback)
    assert link.status_code == 200
    stream = client.get(link.data["url"])
    assert stream.status_code == 200
    assert stream["Content-Type"] == "video/mp4"


def test_bunny_storage_writes_with_the_zone_key(bunny_mode):
    from django.core.files.base import ContentFile

    storage = bunny.BunnyStorage()
    name = storage.save("lecture/x.pdf", ContentFile(b"%PDF-1"))
    put = bunny_mode[-1]
    assert put["method"] == "PUT"
    assert put["url"] == "https://storage.bunnycdn.com/ecst-private/lecture/x.pdf"
    assert put["headers"]["AccessKey"] == "storage-key"
    assert storage.open(name).read() == b"stored bytes"
    with pytest.raises(NotImplementedError):
        storage.url(name)
