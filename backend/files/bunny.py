"""Bunny.net: Storage zones (Django storages), CDN token links, Stream uploads.

Only used when ``MEDIA_BACKEND == "bunny"`` (production), and by ``move_files_to_bunny`` before
the switch. Two zones (owner, 2026-11-16: «ننقل التخزين إلى bunny، كل الملفات»): the private one,
read through token-signed links only, and the public one (the site's images, the people's
photos, the logo) behind a plain pull zone. Every function that talks to Bunny goes through
``_request`` so tests can replace it.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
import urllib.request
from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

STREAM_API = "https://video.bunnycdn.com"
TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload"
EMBED = "https://iframe.mediadelivery.net/embed"


def _request(method: str, url: str, *, headers: dict, data=None) -> bytes:
    """``data`` is bytes, or an open file sent as it is read (its Content-Length in ``headers``):
    a long video is not held in memory. Only sending a file may take long; anything else that
    stalls gives up after a minute rather than hold a web worker (review 2026-11-16)."""
    request = urllib.request.Request(url, data=data, method=method, headers=headers)  # noqa: S310
    timeout = 600 if method == "PUT" else 60
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310  (https only)
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


def stream_delete_video(video_id: str) -> None:
    """The video leaves Bunny Stream with its row (core.deletions, a lecture's media)."""
    _request(
        "DELETE",
        f"{STREAM_API}/library/{settings.BUNNY_STREAM_LIBRARY_ID}/videos/{quote(video_id)}",
        headers={"AccessKey": settings.BUNNY_STREAM_API_KEY},
    )


def stream_embed_url(video_id: str, ttl_seconds: int) -> tuple[str, int]:
    expires = int(time.time()) + ttl_seconds
    token = hashlib.sha256(
        f"{settings.BUNNY_STREAM_TOKEN_KEY}{video_id}{expires}".encode()
    ).hexdigest()
    library = settings.BUNNY_STREAM_LIBRARY_ID
    return f"{EMBED}/{library}/{video_id}?token={token}&expires={expires}", expires


@deconstructible
class BunnyStorage(Storage):
    """A Bunny Storage zone. The private zone (the default) is read through signed CDN links
    only; the public zone has a ``base_url``, its pull zone's address."""

    def __init__(
        self, zone: str | None = None, key: str | None = None, base_url: str | None = None
    ):
        self.zone = zone
        self.key = key
        self.base_url = base_url

    def _url(self, name: str) -> str:
        host = settings.BUNNY_STORAGE_HOST.rstrip("/")
        return f"{host}/{self.zone or settings.BUNNY_STORAGE_ZONE}/{quote(name)}"

    def _headers(self) -> dict:
        return {"AccessKey": self.key or settings.BUNNY_STORAGE_KEY}

    def _save(self, name, content):
        content.seek(0)
        size = content.size
        _request(
            "PUT",
            self._url(name),
            headers={
                **self._headers(),
                "Content-Type": "application/octet-stream",
                "Content-Length": str(size),
            },
            data=content.file if hasattr(content, "file") and content.file else content.read(),
        )
        return name

    def _open(self, name, mode="rb"):
        return ContentFile(_request("GET", self._url(name), headers=self._headers()), name=name)

    def delete(self, name):
        _request("DELETE", self._url(name), headers=self._headers())

    def get_available_name(self, name, max_length=None):
        """A name no other file has: a PUT replaces whatever is there, and some files keep the
        uploader's own name (a video, a site image), so every new file gets a random part —
        two «lecture.mp4» of the same month stay two files (review 2026-11-16)."""
        folder, _, leaf = name.rpartition("/")
        stem, dot, ext = leaf.rpartition(".")
        if not dot or not stem:
            stem, ext = leaf, ""
        ext = f".{ext}" if ext else ""
        tag = f"-{secrets.token_hex(6)}"
        if max_length is not None:
            room = max_length - len(folder) - 1 - len(tag) - len(ext)
            if room < 1:
                raise SuspiciousFileOperation(f"No room for a unique name: {name!r}.")
            stem = stem[:room]
        leaf = f"{stem}{tag}{ext}"
        return f"{folder}/{leaf}" if folder else leaf

    def exists(self, name):
        # Every new name is made unique above, so nothing is overwritten by an upload.
        return False

    def _entries(self, path: str) -> list[dict]:
        url = self._url(path.strip("/") + "/" if path.strip("/") else "")
        if not url.endswith("/"):
            url += "/"
        return json.loads(_request("GET", url, headers={**self._headers(), "Accept": "*/*"}))

    def listdir(self, path):
        """(directories, files) directly under ``path`` (Bunny's list API)."""
        entries = self._entries(path)
        dirs = [e["ObjectName"] for e in entries if e.get("IsDirectory")]
        files = [e["ObjectName"] for e in entries if not e.get("IsDirectory")]
        return dirs, files

    def inventory(self, path: str = "") -> dict[str, int]:
        """Every file under ``path``, with its size: what is already there, for the move."""
        found: dict[str, int] = {}
        for entry in self._entries(path):
            name = f"{path.strip('/')}/{entry['ObjectName']}".lstrip("/")
            if entry.get("IsDirectory"):
                found.update(self.inventory(name))
            else:
                found[name] = int(entry.get("Length", 0))
        return found

    def size(self, name):
        folder, _, leaf = name.rpartition("/")
        for entry in self._entries(folder):
            if entry["ObjectName"] == leaf and not entry.get("IsDirectory"):
                return int(entry.get("Length", 0))
        raise FileNotFoundError(name)

    def url(self, name):
        if not self.base_url:
            raise NotImplementedError("Private files are served through signed links only.")
        return f"{self.base_url.rstrip('/')}/{quote(name)}"
