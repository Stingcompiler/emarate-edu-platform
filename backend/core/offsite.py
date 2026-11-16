"""A copy of every backup off the server (owner, 2026-11-16).

The backups live on the server's own disk (``core.backups``): losing the server loses them. This
keeps a copy of each in an S3-compatible bucket — Cloudflare R2 — as the files already are,
encrypted with ``BACKUP_ENCRYPTION_KEY``: the bucket's owner sees bytes, never a row.

``sync()`` is the whole of it: every copy kept on the server that the bucket lacks is uploaded,
and the bucket keeps the newest ``OFFSITE_BACKUP_KEEP`` copies (more than the server, which
needs its disk). It runs after each backup and every six hours, so a failed upload is simply
tried again. The keys are in the server's environment only, never in the repository.

To bring a copy back after losing the server: download its files from the bucket into
``private/backups/`` of the new installation, set the same ``BACKUP_ENCRYPTION_KEY``, and
restore it from «النسخ الاحتياطية» (docs/runbook.md).
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from core import backups

logger = logging.getLogger(__name__)

STATUS = "offsite-backups"
PREFIX = "backups/"


def configured() -> bool:
    return all(
        getattr(settings, name, "")
        for name in (
            "OFFSITE_BACKUP_ENDPOINT",
            "OFFSITE_BACKUP_BUCKET",
            "OFFSITE_BACKUP_ACCESS_KEY_ID",
            "OFFSITE_BACKUP_SECRET_ACCESS_KEY",
        )
    )


def _client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=settings.OFFSITE_BACKUP_ENDPOINT,
        aws_access_key_id=settings.OFFSITE_BACKUP_ACCESS_KEY_ID,
        aws_secret_access_key=settings.OFFSITE_BACKUP_SECRET_ACCESS_KEY,
        region_name="auto",  # R2
        config=Config(retries={"max_attempts": 5, "mode": "standard"}),
    )


def _stamp(name: str) -> str:
    return name.rsplit("-", 1)[-1].split(".", 1)[0]


def status() -> dict | None:
    return cache.get(STATUS)


def _say(**changes) -> dict:
    found = {**(cache.get(STATUS) or {}), **changes}
    cache.set(STATUS, found, timeout=None)
    return found


def sync() -> dict:
    """Upload what the bucket lacks, prune what it keeps beyond its number. Returns the status
    (also in the cache, for «النسخ الاحتياطية»)."""
    if not configured():
        return {"configured": False}
    bucket = settings.OFFSITE_BACKUP_BUCKET
    client = _client()
    try:
        remote: set[str] = set()
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
            remote.update(item["Key"] for item in page.get("Contents", []))
        local = [
            name
            for suffix in (backups.DB_SUFFIX, backups.MEDIA_SUFFIX, backups.INFO_SUFFIX)
            for name in backups.existing(suffix)
        ]
        # The copies the bucket is to hold: the newest ``keep`` of all there are, here or there.
        # An older one is neither uploaded (it would only be pruned again) nor kept.
        keep = max(1, int(getattr(settings, "OFFSITE_BACKUP_KEEP", 30)))
        wanted = set(sorted({_stamp(n) for n in local} | {_stamp(k) for k in remote})[-keep:])
        uploaded = []
        for name in sorted(local, key=_stamp):
            key = PREFIX + name.rsplit("/", 1)[-1]
            stamp = _stamp(name)
            if key in remote or stamp not in wanted:
                continue
            backups.reading(stamp, seconds=3600)  # the daily prune leaves it while it goes up
            try:
                with backups.default_storage.open(name, "rb") as handle:
                    client.upload_fileobj(handle, bucket, key)
            finally:
                backups.done_reading(stamp)
            remote.add(key)
            uploaded.append(key)
        pruned = []
        for key in sorted(remote):
            if _stamp(key) not in wanted:
                client.delete_object(Bucket=bucket, Key=key)
                pruned.append(key)
        by_stamp = {_stamp(k) for k in remote} & wanted
        newest = max(by_stamp) if by_stamp else ""
        return _say(
            configured=True,
            ok=True,
            at=timezone.now().isoformat(),
            newest=newest,
            copies=len(by_stamp),
            uploaded=len(uploaded),
            error="",
        )
    except Exception as error:
        logger.exception("off-server backup copy failed")
        _say(configured=True, ok=False, at=timezone.now().isoformat(), error=str(error)[:300])
        raise
