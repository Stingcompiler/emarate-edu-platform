"""Visitor sessions: email + OTP → a 30-minute token scoped to one contact (docs/03 §4).

The token is opaque (random), stored hashed, and sent as
``Authorization: Visitor <token>`` by the apply/track pages.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import authentication, exceptions, permissions

from accounts import otp
from accounts.models import OneTimeCode
from core.errors import Locked
from notifications.models import Outbox
from organization.models import SystemSettings

from .models import Contact, VisitorSession

SESSION_MINUTES = 30


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start(email: str) -> None:
    """Always the same answer; the code goes to the address given (docs/03 §4)."""
    email = email.strip().lower()
    _, code = otp.issue(OneTimeCode.Purpose.CONTACT, email)
    minutes = SystemSettings.load().otp_ttl_minutes
    with transaction.atomic():
        Outbox.objects.create(
            to=email,
            subject="رمز التحقق — كلية الإمارات",
            body=f"رمز التحقق لمتابعة طلباتك: {code}\n\nصالح لمدة {minutes} دقائق.",
        )
        from notifications.tasks import deliver_outbox

        transaction.on_commit(lambda: deliver_outbox.delay())


def verify(
    email: str, code: str, *, name: str = "", ip: str | None = None
) -> tuple[str, VisitorSession]:
    email = email.strip().lower()
    latest = (
        OneTimeCode.objects.filter(purpose=OneTimeCode.Purpose.CONTACT, target=email)
        .order_by("-created_at")
        .first()
    )
    result = otp.check(latest, code)
    if result is otp.OTPResult.TOO_MANY_ATTEMPTS:
        raise Locked("Too many attempts. Request a new code.")
    if result is not otp.OTPResult.OK:
        raise exceptions.ValidationError({"code": ["Invalid or expired code."]})
    now = timezone.now()
    with transaction.atomic():
        contact = Contact.objects.filter(email=email).first()
        if contact is None:
            contact = Contact.objects.create(email=email, name=name.strip() or email.split("@")[0])
        if contact.email_verified_at is None:
            contact.email_verified_at = now
            contact.save(update_fields=["email_verified_at", "updated_at"])
        token = secrets.token_urlsafe(32)
        session = VisitorSession.objects.create(
            contact=contact,
            token_hash=_hash(token),
            expires_at=now + timedelta(minutes=SESSION_MINUTES),
            ip=ip,
        )
    return token, session


class VisitorAuthentication(authentication.BaseAuthentication):
    """``Authorization: Visitor <token>`` → request.contact (request.user stays anonymous)."""

    keyword = "Visitor"

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith(f"{self.keyword} "):
            return None
        token = header[len(self.keyword) + 1 :].strip()
        session = (
            VisitorSession.objects.select_related("contact")
            .filter(token_hash=_hash(token), expires_at__gt=timezone.now())
            .first()
        )
        if session is None:
            raise exceptions.AuthenticationFailed("Your session expired. Verify your email again.")
        request.contact = session.contact
        return (None, session)

    def authenticate_header(self, request):
        return self.keyword


class IsVisitor(permissions.BasePermission):
    def has_permission(self, request, view):
        return getattr(request, "contact", None) is not None
