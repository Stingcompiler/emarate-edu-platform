"""Web Push with VAPID (pywebpush). No FCM/APNs account needed (docs/04)."""

from __future__ import annotations

import json
import logging
from functools import cache
from pathlib import Path

from django.conf import settings
from django.utils import timezone

log = logging.getLogger(__name__)
_DEV_KEYS = Path(settings.BASE_DIR) / ".vapid-dev.json"


def _generate() -> dict:
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid01, b64urlencode

    vapid = Vapid01()
    vapid.generate_keys()
    private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    public = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return {"public": b64urlencode(public), "private": b64urlencode(private)}


@cache
def keys() -> dict | None:
    """VAPID keys from settings; in DEBUG, a local key pair is created once."""
    if settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY:
        return {"public": settings.VAPID_PUBLIC_KEY, "private": settings.VAPID_PRIVATE_KEY}
    if not settings.DEBUG:
        return None
    if not _DEV_KEYS.exists():
        _DEV_KEYS.write_text(json.dumps(_generate()))
    return json.loads(_DEV_KEYS.read_text())


def send(subscription, payload: dict) -> bool:
    """Deliver one push. Returns False (and deletes the subscription) when it is gone."""
    from pywebpush import WebPushException, webpush

    found = keys()
    if found is None:
        return False
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=found["private"],
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=24 * 3600,
            timeout=10,
        )
    except WebPushException as error:
        status = getattr(error.response, "status_code", None)
        if status in (404, 410):
            subscription.delete()  # the browser unsubscribed or the endpoint expired
        else:
            log.warning("push failed", extra={"status": status, "endpoint": subscription.endpoint})
        return False
    subscription.last_success_at = timezone.now()
    subscription.save(update_fields=["last_success_at", "updated_at"])
    return True
