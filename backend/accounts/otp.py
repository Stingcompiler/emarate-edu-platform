"""One-time codes: 6 digits, stored hashed, short-lived, limited attempts."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta
from enum import Enum

from django.conf import settings
from django.db.models import F
from django.utils import timezone

from organization.models import SystemSettings

from .models import OneTimeCode


class OTPResult(Enum):
    OK = "ok"
    INVALID = "invalid"
    EXPIRED = "expired"
    TOO_MANY_ATTEMPTS = "too_many_attempts"


def _hash(code: str, target: str) -> str:
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"{target}:{code}".encode(), hashlib.sha256).hexdigest()


def issue(purpose: str, target: str) -> tuple[OneTimeCode, str]:
    """Create a code for ``target`` (normalized email); returns the row and the plain code."""
    config = SystemSettings.load()
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = OneTimeCode.objects.create(
        purpose=purpose,
        target=target,
        code_hash=_hash(code, target),
        expires_at=timezone.now() + timedelta(minutes=config.otp_ttl_minutes),
    )
    return otp, code


def check(otp: OneTimeCode | None, code: str) -> OTPResult:
    """Verify ``code`` against ``otp`` and consume it on success.

    The attempt is counted in one UPDATE before the comparison, so parallel guesses can't
    all read the same count and exceed ``otp_max_attempts`` (a reset code would otherwise
    be open to a burst of concurrent tries).
    """
    if otp is None or otp.used_at is not None:
        return OTPResult.INVALID
    config = SystemSettings.load()
    if otp.attempts >= config.otp_max_attempts:
        return OTPResult.TOO_MANY_ATTEMPTS
    now = timezone.now()
    if now >= otp.expires_at:
        return OTPResult.EXPIRED
    rows = OneTimeCode.objects.filter(pk=otp.pk, used_at__isnull=True)
    counted = rows.filter(attempts__lt=config.otp_max_attempts).update(
        attempts=F("attempts") + 1, updated_at=now
    )
    if not counted:
        otp.refresh_from_db(fields=["attempts", "used_at"])
        return OTPResult.INVALID if otp.used_at else OTPResult.TOO_MANY_ATTEMPTS
    otp.refresh_from_db(fields=["attempts"])
    if hmac.compare_digest(otp.code_hash, _hash(code.strip(), otp.target)):
        # Consumed once, even if the right code arrives twice at the same moment.
        if not rows.update(used_at=now, updated_at=now):
            return OTPResult.INVALID
        otp.used_at = now
        return OTPResult.OK
    if otp.attempts >= config.otp_max_attempts:
        return OTPResult.TOO_MANY_ATTEMPTS
    return OTPResult.INVALID
