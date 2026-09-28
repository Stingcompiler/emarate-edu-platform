"""Inquiry intake, routing, replies and status changes (docs/03 §8, docs/02 §4.12).

Routing: admission/programs with a department → that department's registrars;
admission/programs without one → the head registrar; everything else → the
site manager (who can reroute).
"""

from __future__ import annotations

import secrets
from urllib.parse import quote

import phonenumbers
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts import rbac
from accounts.rbac import Role
from audit.services import SYSTEM, RequestMeta, record
from contacts.models import match_or_create
from core.errors import Conflict
from notifications.models import Category, Outbox
from notifications.services import notify

from .models import Inquiry, InquiryMessage, InquiryStatusHistory

ADMISSION_TYPES = {Inquiry.Type.ADMISSION, Inquiry.Type.PROGRAMS}
TRANSITIONS = {
    "new": {"in_progress", "waiting_for_user", "resolved", "closed"},
    "in_progress": {"waiting_for_user", "resolved", "closed"},
    "waiting_for_user": {"in_progress", "resolved", "closed"},
    "resolved": {"in_progress", "closed"},
    "closed": {"in_progress"},
}


def normalize_phone(raw: str) -> str | None:
    if not raw:
        return None
    try:
        parsed = phonenumbers.parse(raw, "SD")
    except phonenumbers.NumberParseException:
        raise ValidationError({"phone": [gettext("Invalid phone number.")]}) from None
    if not phonenumbers.is_valid_number(parsed):
        raise ValidationError({"phone": [gettext("Invalid phone number.")]})
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def _reference() -> str:
    return f"INQ-{timezone.now():%y}-{secrets.token_hex(3).upper()}"


def handlers_q(inquiry_type: str, department_id: int | None) -> Q:
    """Users who receive an inquiry of this type/department."""
    if inquiry_type in ADMISSION_TYPES:
        if department_id:
            return Q(
                role_assignments__role=Role.REGISTRAR, role_assignments__department=department_id
            )
        return Q(role_assignments__role=Role.HEAD_REGISTRAR)
    return Q(role_assignments__role=Role.SITE_MANAGER)


def visible_q(user) -> Q:
    """Inquiries a staff user may see (docs/03 §7 «استفسارات»)."""
    roles = rbac.roles_of(user)
    if Role.SYSTEM_ADMIN in roles:
        return Q(pk__isnull=False)
    q = Q(pk__in=[])
    if Role.SITE_MANAGER in roles:
        q |= Q(pk__isnull=False)  # sees all general ones and reads admission ones to reroute
    if Role.HEAD_REGISTRAR in roles:
        q |= Q(type__in=ADMISSION_TYPES)
    registrar_departments = [
        d
        for r, d in user.role_assignments.values_list("role", "department_id")
        if r == Role.REGISTRAR
    ]
    if registrar_departments:
        q |= Q(type__in=ADMISSION_TYPES, department__in=registrar_departments)
    return q


def can_reply(user, inquiry: Inquiry) -> bool:
    roles = rbac.roles_of(user)
    if Role.SYSTEM_ADMIN in roles:
        return True
    if inquiry.type in ADMISSION_TYPES:
        if Role.HEAD_REGISTRAR in roles:
            return True
        return user.role_assignments.filter(
            role=Role.REGISTRAR, department=inquiry.department_id
        ).exists()
    return Role.SITE_MANAGER in roles


def submit(*, name, email, phone, type, department, subject, message, source="web") -> Inquiry:
    phone_e164 = normalize_phone(phone)
    if not email and not phone_e164:
        raise ValidationError({"email": [gettext("Give an email or a phone number.")]})
    if type not in ADMISSION_TYPES:
        department = None  # only admission/program questions are department-routed
    with transaction.atomic():
        contact = match_or_create(name=name, email=email, phone_e164=phone_e164)
        for _ in range(5):
            try:
                with transaction.atomic():
                    inquiry = Inquiry.objects.create(
                        reference_no=_reference(),
                        contact=contact,
                        type=type,
                        department=department,
                        subject=subject,
                        message=message,
                        source=source,
                    )
                break
            except IntegrityError:
                continue
        InquiryStatusHistory.objects.create(inquiry=inquiry, to_status=Inquiry.Status.NEW)
        record(
            SYSTEM,
            "inquiry.submit",
            inquiry,
            new={"type": type},
            department_id=inquiry.department_id,
        )
        handlers = (
            get_user_model()
            .objects.filter(handlers_q(type, inquiry.department_id), is_active=True)
            .distinct()
        )
        notify(
            handlers,
            category=Category.COLLEGE,
            title=f"استفسار جديد: {subject}",
            body=f"{inquiry.get_type_display()} · {contact.name}",
            action_url=f"/inquiries/{inquiry.public_id}",
        )
    return inquiry


def _require(user, inquiry: Inquiry) -> None:
    if not can_reply(user, inquiry):
        raise PermissionDenied(gettext("This inquiry is routed to someone else."))


def _set_status(meta, inquiry: Inquiry, to: str, note: str = "") -> None:
    if to == inquiry.status:
        return
    if to not in TRANSITIONS[inquiry.status]:
        raise Conflict(
            gettext("Cannot move from %(status)s to %(to)s.")
            % {"status": inquiry.status, "to": to},
            code="bad_transition",
        )
    InquiryStatusHistory.objects.create(
        inquiry=inquiry, from_status=inquiry.status, to_status=to, by=meta.actor, note=note
    )
    inquiry.status = to
    if to == Inquiry.Status.RESOLVED:
        inquiry.resolved_at = timezone.now()


def reply(
    meta: RequestMeta, inquiry: Inquiry, *, body: str, channel: str = "email"
) -> InquiryMessage:
    """An email reply (queued in the outbox) or an internal note."""
    _require(meta.actor, inquiry)
    if channel not in ("email", "internal"):
        raise ValidationError({"channel": [gettext("Reply by email or add an internal note.")]})
    if channel == "email" and not inquiry.contact.email:
        raise ValidationError({"channel": [gettext("This visitor has no email; use WhatsApp.")]})
    with transaction.atomic():
        message = InquiryMessage.objects.create(
            inquiry=inquiry, author=meta.actor, channel=channel, body=body
        )
        if channel == "email":
            Outbox.objects.create(
                to=inquiry.contact.email,
                subject=f"رد على استفسارك {inquiry.reference_no} — كلية الإمارات",
                body=f"{body}\n\nرقم الاستفسار: {inquiry.reference_no}",
            )
            if inquiry.first_response_at is None:
                inquiry.first_response_at = timezone.now()
            if inquiry.status == Inquiry.Status.NEW:
                _set_status(meta, inquiry, Inquiry.Status.IN_PROGRESS)
            inquiry.save()
            from notifications.tasks import deliver_outbox

            transaction.on_commit(lambda: deliver_outbox.delay())
        record(meta, f"inquiry.{channel}", inquiry, department_id=inquiry.department_id)
    return message


def whatsapp(meta: RequestMeta, inquiry: Inquiry, *, body: str) -> str:
    """A wa.me link to the visitor's normalized number, logged as a message."""
    _require(meta.actor, inquiry)
    phone = inquiry.contact.phone_e164
    if not phone:
        raise ValidationError({"detail": [gettext("This visitor has no phone number.")]})
    with transaction.atomic():
        InquiryMessage.objects.create(
            inquiry=inquiry, author=meta.actor, channel="whatsapp_note", body=body
        )
        if inquiry.first_response_at is None:
            inquiry.first_response_at = timezone.now()
            inquiry.save(update_fields=["first_response_at", "updated_at"])
        record(meta, "inquiry.whatsapp", inquiry, department_id=inquiry.department_id)
    return f"https://wa.me/{phone.lstrip('+')}?text={quote(body)}"


def transition(meta: RequestMeta, inquiry: Inquiry, *, to: str, note: str = "") -> Inquiry:
    _require(meta.actor, inquiry)
    with transaction.atomic():
        _set_status(meta, inquiry, to, note)
        inquiry.save()
        record(
            meta, "inquiry.status", inquiry, new={"status": to}, department_id=inquiry.department_id
        )
    return inquiry


def assign(meta: RequestMeta, inquiry: Inquiry, user) -> Inquiry:
    _require(meta.actor, inquiry)
    if (
        user is not None
        and not get_user_model()
        .objects.filter(handlers_q(inquiry.type, inquiry.department_id), pk=user.pk)
        .exists()
        and not rbac.has_role(user, Role.SYSTEM_ADMIN)
    ):
        raise ValidationError(
            {"user": [gettext("This person does not handle this kind of inquiry.")]}
        )
    inquiry.assigned_to = user
    inquiry.save(update_fields=["assigned_to", "updated_at"])
    record(
        meta,
        "inquiry.assign",
        inquiry,
        new={"user": getattr(user, "pk", None)},
        department_id=inquiry.department_id,
    )
    return inquiry


def reroute(meta: RequestMeta, inquiry: Inquiry, *, type: str, department) -> Inquiry:
    """The site manager (or admin) corrects the type/department; handlers change accordingly."""
    if not rbac.has_role(meta.actor, Role.SITE_MANAGER, Role.SYSTEM_ADMIN):
        raise PermissionDenied()
    with transaction.atomic():
        old = {"type": inquiry.type, "department": inquiry.department_id}
        inquiry.type = type
        inquiry.department = department if type in ADMISSION_TYPES else None
        inquiry.assigned_to = None
        inquiry.save()
        record(
            meta,
            "inquiry.reroute",
            inquiry,
            old=old,
            new={"type": type, "department": inquiry.department_id},
            department_id=inquiry.department_id,
        )
        handlers = (
            get_user_model()
            .objects.filter(handlers_q(inquiry.type, inquiry.department_id), is_active=True)
            .distinct()
        )
        notify(
            handlers,
            category=Category.COLLEGE,
            title=f"استفسار حُوّل إليك: {inquiry.subject}",
            action_url=f"/inquiries/{inquiry.public_id}",
        )
    return inquiry
