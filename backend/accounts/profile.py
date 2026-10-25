"""A student's own contact details and photo (docs/03 §3.10: a student edits their email, phone
and photo; review 2026-10-25 decisions, item 13).

The new email is confirmed by a code sent to it before it replaces the old one, and the old
address is told of the change. The phone is normalized; the photo is an image the student
uploaded, readable by them and by staff who may see their record.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils.translation import gettext
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.services import RequestMeta, record
from core.errors import Invalid, Locked
from organization.models import SystemSettings

from . import emails, otp, rbac
from .models import OneTimeCode, User

PHOTO_TYPES = frozenset({"jpg", "jpeg", "png", "webp"})


def _student(user) -> None:
    if not hasattr(user, "student_record") or user.student_record is None:
        raise PermissionDenied(gettext("Only a student edits these details here."))


def _target(user: User, email: str) -> str:
    # The code is bound to the account and the address: it changes this account's email only.
    return f"{user.pk}:{email}"


def start_email_change(meta: RequestMeta, user: User, email: str) -> None:
    """Send a code to the new address. The answer is the same whether or not the address is
    taken, so the form does not tell whose it is."""
    _student(user)
    email = (email or "").strip().lower()
    try:
        validate_email(email)
    except DjangoValidationError:
        raise ValidationError({"email": [gettext("Enter a valid email address.")]}) from None
    if email == user.email or User.objects.filter(email=email).exists():
        return
    _, code = otp.issue(OneTimeCode.Purpose.EMAIL_CHANGE, _target(user, email))
    minutes = SystemSettings.load().otp_ttl_minutes
    transaction.on_commit(lambda: emails.email_change_code(email, code, minutes))


def confirm_email_change(meta: RequestMeta, user: User, email: str, code: str) -> User:
    _student(user)
    email = (email or "").strip().lower()
    latest = (
        OneTimeCode.objects.filter(
            purpose=OneTimeCode.Purpose.EMAIL_CHANGE, target=_target(user, email)
        )
        .order_by("-created_at")
        .first()
    )
    result = otp.check(latest, code)
    if result is otp.OTPResult.TOO_MANY_ATTEMPTS:
        raise Locked(gettext("Too many attempts. Request a new code."))
    if result is not otp.OTPResult.OK:
        raise Invalid({"code": [gettext("Invalid or expired code.")]}, code="invalid_code")
    old = user.email
    try:
        with transaction.atomic():
            user.email = email
            user.save(update_fields=["email"])
            record(meta, "account.email_change", user, old={"email": old}, new={"email": email})
    except IntegrityError:
        raise Invalid(
            {"email": [gettext("This email is already used by another account.")]},
            code="email_taken",
        ) from None
    transaction.on_commit(lambda: emails.email_changed(old, email))
    return user


def update_contact(meta: RequestMeta, user: User, **data) -> User:
    """Phone and photo; what is not given stays as it is."""
    _student(user)
    from files.models import Purpose, StoredFile
    from inquiries.services import normalize_phone

    old = {
        "phone_e164": user.phone_e164,
        "photo": str(user.photo.public_id) if user.photo else None,
    }
    changed = []
    if "phone_e164" in data:
        raw = (data["phone_e164"] or "").strip()
        user.phone_e164 = normalize_phone(raw) if raw else ""
        changed.append("phone_e164")
    if "photo" in data:
        photo = data["photo"]
        if photo is not None and not (
            isinstance(photo, StoredFile)
            and photo.purpose == Purpose.PHOTO
            and photo.uploaded_by_id == user.pk
        ):
            raise ValidationError({"photo": [gettext("Upload your photo first.")]})
        user.photo = photo
        changed.append("photo")
    if changed:
        with transaction.atomic():
            user.save(update_fields=changed)
            new = {
                "phone_e164": user.phone_e164,
                "photo": str(user.photo.public_id) if user.photo else None,
            }
            record(meta, "account.contact_update", user, old=old, new=new)
    return user


def _photo_readable(user, stored) -> bool:
    """Staff who may see the student's record (the owner is let through by files.access)."""
    owner = User.objects.filter(photo=stored).select_related("student_record").first()
    record_ = getattr(owner, "student_record", None) if owner else None
    return record_ is not None and rbac.can(user, "students.view", record_.department_id)


def register_file_policy() -> None:
    from files import access

    access.register(
        "photo",
        access.Policy(
            can_upload=lambda user, offering: hasattr(user, "student_record"),
            can_read=_photo_readable,
            allowed_extensions=PHOTO_TYPES,
            max_mb=5,
            needs_offering=False,
        ),
    )
