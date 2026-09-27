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


def match_or_create(*, name: str, email: str | None, phone_e164: str | None) -> Contact:
    """Same email or phone → same contact; the name is never a lookup key."""
    email = (email or "").strip().lower() or None
    found = None
    if email:
        found = Contact.objects.filter(email=email).first()
    if found is None and phone_e164:
        found = Contact.objects.filter(phone_e164=phone_e164).first()
    if found is None:
        return Contact.objects.create(name=name, email=email, phone_e164=phone_e164)
    changed = []
    if email and not found.email and not Contact.objects.filter(email=email).exists():
        found.email = email
        changed.append("email")
    if (
        phone_e164
        and not found.phone_e164
        and not Contact.objects.filter(phone_e164=phone_e164).exists()
    ):
        found.phone_e164 = phone_e164
        changed.append("phone_e164")
    if changed:
        found.save(update_fields=[*changed, "updated_at"])
    return found
