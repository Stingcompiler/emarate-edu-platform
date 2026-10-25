"""A visitor's identity: email and/or phone (docs/02 §4.10).

Matched or created on the first inquiry or application. The OTP-verified
visitor session that lets a contact follow their requests arrives in Phase 7.
"""

from django.db import models

from core.models import PublicIdModel, TimestampedModel


class Contact(PublicIdModel, TimestampedModel):
    email = models.EmailField(null=True, blank=True, unique=True)
    phone_e164 = models.CharField(max_length=20, null=True, blank=True, unique=True)
    name = models.CharField(max_length=200)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(email__isnull=False) | models.Q(phone_e164__isnull=False),
                name="contact_has_email_or_phone",
            )
        ]

    def __str__(self) -> str:
        return self.name


class VisitorSession(TimestampedModel):
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="sessions")
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"visitor:{self.contact_id}"


def match_or_create(*, name: str, email: str | None, phone_e164: str | None) -> Contact:
    """Same email → same contact; with no email, same phone → same contact. The name is never a
    lookup key.

    An identifier nobody verified is never added to an existing contact (review 2026-10-25 R12):
    an email added to a phone-only contact let whoever then verified that email read the
    contact's history, and a phone added to an email contact would send the college's WhatsApp
    replies to it. A new email whose phone already belongs to someone else gets its own contact
    (without that phone); staff merge by hand if it really is the same person.
    """
    email = (email or "").strip().lower() or None
    if email:
        found = Contact.objects.filter(email=email).first()
        if found is not None:
            return found
        phone_free = phone_e164 and not Contact.objects.filter(phone_e164=phone_e164).exists()
        return Contact.objects.create(
            name=name, email=email, phone_e164=phone_e164 if phone_free else None
        )
    found = Contact.objects.filter(phone_e164=phone_e164).first()
    return found or Contact.objects.create(name=name, phone_e164=phone_e164)
