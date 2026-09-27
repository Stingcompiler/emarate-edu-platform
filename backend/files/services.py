"""Upload, sign and serve private files; issue video upload tickets."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from audit.services import RequestMeta, record
from core.errors import Invalid

from . import access, bunny, validation
from .models import StoredFile, VideoAsset

LINK_TTL = 10 * 60  # docs/02 Phase 2: a file link expires after 10 minutes
_SALT = "files.download"


def _bunny() -> bool:
    return settings.MEDIA_BACKEND == "bunny"


def _expiry(timestamp: int) -> datetime:
    return datetime.fromtimestamp(timestamp, tz=UTC)


# ─── Files ────────────────────────────────────────────────────────────────


def upload(meta: RequestMeta, *, purpose: str, offering, uploaded) -> StoredFile:
    found = access.policy(purpose)
    if found is None:
        raise ValidationError({"purpose": ["Unknown purpose."]})
    if not found.can_upload(meta.actor, offering):
        raise PermissionDenied("You cannot upload files to this course.")
    try:
        kind = validation.check(uploaded, allowed=found.allowed_extensions, max_mb=found.max_mb)
    except validation.UploadError as error:
        raise ValidationError({"file": [str(error)]}) from None
    digest = hashlib.sha256()
    for chunk in uploaded.chunks():
        digest.update(chunk)
    uploaded.seek(0)
    with transaction.atomic():
        stored = StoredFile.objects.create(
            purpose=purpose,
            offering=offering,
            file=uploaded,
            name=uploaded.name[:255],
            size=uploaded.size,
            mime=kind.mime,
            sha256=digest.hexdigest(),
            uploaded_by=meta.actor,
        )
        record(
            meta,
            "file.upload",
            stored,
            new={"purpose": purpose, "size": stored.size},
            department_id=offering.course.department_id,
        )
    return stored


def signed_url(user, stored: StoredFile) -> tuple[str, datetime]:
    if not access.can_read(user, stored):
        raise NotFound()
    return _sign(stored.file.name, f"f:{stored.public_id}")


def _sign(storage_name: str, token_value: str) -> tuple[str, datetime]:
    if _bunny():
        url, expires = bunny.cdn_url(storage_name, LINK_TTL)
        return url, _expiry(expires)
    token = signing.TimestampSigner(salt=_SALT).sign(token_value)
    url = reverse("file-download", kwargs={"token": token})
    return url, timezone.now() + timedelta(seconds=LINK_TTL)


def resolve_download(token: str):
    """Local development only: the signed token → (file field, name, mime, inline)."""
    try:
        value = signing.TimestampSigner(salt=_SALT).unsign(token, max_age=LINK_TTL)
    except signing.BadSignature:
        raise NotFound() from None
    kind, _, public_id = value.partition(":")
    if kind == "f":
        stored = StoredFile.objects.filter(public_id=public_id).first()
        if stored is None:
            raise NotFound()
        return stored.file, stored.name, stored.mime, False
    video = VideoAsset.objects.filter(public_id=public_id, provider="local").first()
    if video is None or not video.file:
        raise NotFound()
    return video.file, f"{video.title}.mp4", "video/mp4", True


# ─── Videos ───────────────────────────────────────────────────────────────


def video_ticket(meta: RequestMeta, *, offering, title: str, size: int) -> tuple[VideoAsset, dict]:
    if access.video_can_upload is None or not access.video_can_upload(meta.actor, offering):
        raise PermissionDenied("You cannot upload videos to this course.")
    if size > settings.VIDEO_MAX_MB * 1024 * 1024:
        raise ValidationError({"size": [f"Videos are limited to {settings.VIDEO_MAX_MB} MB."]})
    with transaction.atomic():
        video = VideoAsset.objects.create(
            offering=offering,
            title=title,
            size=size,
            provider=VideoAsset.Provider.BUNNY if _bunny() else VideoAsset.Provider.LOCAL,
            uploaded_by=meta.actor,
        )
        if _bunny():
            video.provider_id = bunny.stream_create_video(title)
            video.save(update_fields=["provider_id", "updated_at"])
            ticket = bunny.stream_tus_ticket(video.provider_id)
        else:
            ticket = {
                "mode": "local",
                "upload_url": reverse("video-local-upload", kwargs={"public_id": video.public_id}),
            }
        record(
            meta,
            "video.ticket",
            video,
            new={"size": size, "provider": video.provider},
            department_id=offering.course.department_id,
        )
    return video, ticket


def local_video_upload(meta: RequestMeta, video: VideoAsset, uploaded) -> VideoAsset:
    if video.provider != VideoAsset.Provider.LOCAL:
        raise ValidationError({"detail": ["This video uploads directly to the video service."]})
    if video.uploaded_by_id != getattr(meta.actor, "pk", None):
        raise NotFound()
    if video.status != VideoAsset.Status.UPLOADING:
        raise ValidationError({"detail": ["This video was already uploaded."]})
    if validation.extension_of(uploaded.name) not in validation.VIDEO_EXTENSIONS:
        raise ValidationError({"file": ["Upload an MP4, MOV, MKV or WebM video."]})
    video.file = uploaded
    video.size = uploaded.size
    video.status = VideoAsset.Status.READY
    video.save(update_fields=["file", "size", "status", "updated_at"])
    return video


def video_playback(user, video: VideoAsset) -> tuple[str, datetime]:
    if video.uploaded_by_id != getattr(user, "pk", None) and not (
        access.video_can_read and access.video_can_read(user, video)
    ):
        raise NotFound()
    if video.status != VideoAsset.Status.READY:
        raise Invalid({"detail": ["The video is not ready yet."]}, code="not_ready")
    if video.provider == VideoAsset.Provider.BUNNY:
        url, expires = bunny.stream_embed_url(video.provider_id, LINK_TTL)
        return url, _expiry(expires)
    return _sign(video.file.name, f"v:{video.public_id}")


# Bunny Stream webhook statuses (docs.bunny.net): 3 finished, 4 resolution finished, 5 failed.
_BUNNY_STATUS = {
    3: VideoAsset.Status.READY,
    4: VideoAsset.Status.READY,
    5: VideoAsset.Status.FAILED,
}


def bunny_webhook(payload: dict) -> None:
    status = _BUNNY_STATUS.get(payload.get("Status"))
    if status is None:
        return
    VideoAsset.objects.filter(
        provider=VideoAsset.Provider.BUNNY, provider_id=str(payload.get("VideoGuid", ""))
    ).update(status=status)
