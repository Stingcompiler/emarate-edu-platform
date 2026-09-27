"""Bunny.net: private Storage (Django storage), CDN token links, Stream uploads.

Only used when ``MEDIA_BACKEND == "bunny"`` (production). Every function that
talks to Bunny goes through ``_request`` so tests can replace it.
"""

from __future__ import annotations

import base64
import hashlib
import json
import time
import urllib.request
from urllib.parse import quote

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

STREAM_API = "https://video.bunnycdn.com"
TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload"
EMBED = "https://iframe.mediadelivery.net/embed"


def _request(method: str, url: str, *, headers: dict, data: bytes | None = None) -> bytes:
    request = urllib.request.Request(url, data=data, method=method, headers=headers)  # noqa: S310
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310  (https only)
        return response.read()


def cdn_url(path: str, ttl_seconds: int) -> tuple[str, int]:
    """Token-authenticated pull-zone URL (Bunny token authentication, SHA256)."""
    expires = int(time.time()) + ttl_seconds
    path = "/" + path.lstrip("/")
    digest = hashlib.sha256(f"{settings.BUNNY_TOKEN_KEY}{path}{expires}".encode()).digest()
    token = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    host = settings.BUNNY_PULL_ZONE_URL.rstrip("/")
    return f"{host}{quote(path)}?token={token}&expires={expires}", expires


def stream_create_video(title: str) -> str:
    body = _request(
        "POST",
        f"{STREAM_API}/library/{settings.BUNNY_STREAM_LIBRARY_ID}/videos",
        headers={"AccessKey": settings.BUNNY_STREAM_API_KEY, "Content-Type": "application/json"},
        data=json.dumps({"title": title}).encode(),
    )
    return json.loads(body)["guid"]


def stream_tus_ticket(video_id: str, ttl_seconds: int = 6 * 3600) -> dict:
    """Headers the browser sends to Bunny's TUS endpoint. The file never reaches us."""
    library = str(settings.BUNNY_STREAM_LIBRARY_ID)
    expires = int(time.time()) + ttl_seconds
    signature = hashlib.sha256(
        f"{library}{settings.BUNNY_STREAM_API_KEY}{expires}{video_id}".encode()
    ).hexdigest()
    return {
        "mode": "tus",
        "endpoint": TUS_ENDPOINT,
        "headers": {
            "AuthorizationSignature": signature,
            "AuthorizationExpire": str(expires),
            "VideoId": video_id,
            "LibraryId": library,
        },
        "expires": expires,
    }


def stream_embed_url(video_id: str, ttl_seconds: int) -> tuple[str, int]:
    expires = int(time.time()) + ttl_seconds
    token = hashlib.sha256(
        f"{settings.BUNNY_STREAM_TOKEN_KEY}{video_id}{expires}".encode()
    ).hexdigest()
    library = settings.BUNNY_STREAM_LIBRARY_ID
    return f"{EMBED}/{library}/{video_id}?token={token}&expires={expires}", expires


@deconstructible
class BunnyStorage(Storage):
    """Private Bunny Storage zone. Files are read through signed CDN links only."""

    def _url(self, name: str) -> str:
        host = settings.BUNNY_STORAGE_HOST.rstrip("/")
        return f"{host}/{settings.BUNNY_STORAGE_ZONE}/{quote(name)}"

    def _headers(self) -> dict:
        return {"AccessKey": settings.BUNNY_STORAGE_KEY}

    def _save(self, name, content):
        content.seek(0)
        _request(
            "PUT",
            self._url(name),
            headers={**self._headers(), "Content-Type": "application/octet-stream"},
            data=content.read(),
        )
        return name

    def _open(self, name, mode="rb"):
        return ContentFile(_request("GET", self._url(name), headers=self._headers()), name=name)

    def delete(self, name):
        _request("DELETE", self._url(name), headers=self._headers())

    def exists(self, name):
        # Names are random UUIDs, so collisions are not a concern.
        return False

    def url(self, name):
        raise NotImplementedError("Private files are served through signed links only.")
