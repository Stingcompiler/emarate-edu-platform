"""Visitor inquiries with routing, messages and status history (docs/02 §4.12)."""

from django.conf import settings
from django.db import models

from core.models import PublicIdModel, TimestampedModel


class Inquiry(PublicIdModel, TimestampedModel):
    class Type(models.TextChoices):
        ADMISSION = "admission", "القبول"
        PROGRAMS = "programs", "البرامج"
        REGISTRATION = "registration", "التسجيل"
        FEES = "fees", "الرسوم"
        STUDY = "study", "الدراسة"
        TECHNICAL = "technical", "مشكلة تقنية"
        GENERAL = "general", "عام"

    class Status(models.TextChoices):
        NEW = "new", "جديد"
        IN_PROGRESS = "in_progress", "قيد المعالجة"
        WAITING_FOR_USER = "waiting_for_user", "بانتظار الزائر"
        RESOLVED = "resolved", "تم الحل"
        CLOSED = "closed", "مغلق"

    class Source(models.TextChoices):
        WEB = "web", "الموقع"
        WHATSAPP = "whatsapp", "WhatsApp"
        PHONE = "phone", "هاتف"
        EMAIL = "email", "بريد"

    reference_no = models.CharField(max_length=20, unique=True)
    contact = models.ForeignKey(
        "contacts.Contact", on_delete=models.PROTECT, related_name="inquiries"
    )
    type = models.CharField(max_length=14, choices=Type.choices)
    department = models.ForeignKey(
        "organization.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    subject = models.CharField(max_length=200)
    message = models.TextField(max_length=4000)
    status = models.CharField(max_length=18, choices=Status.choices, default=Status.NEW)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.WEB)
    first_response_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "type"]),
            models.Index(fields=["department", "status"]),
        ]

    def __str__(self) -> str:
        return self.reference_no


class InquiryMessage(models.Model):
    class Channel(models.TextChoices):
        PORTAL = "portal", "الموقع"
        EMAIL = "email", "بريد"
        WHATSAPP_NOTE = "whatsapp_note", "WhatsApp"
        INTERNAL = "internal", "ملاحظة داخلية"

    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="Empty = the visitor.",
    )
    channel = models.CharField(max_length=14, choices=Channel.choices)
    body = models.TextField(max_length=4000)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sent_at", "id"]

    def __str__(self) -> str:
        return f"{self.inquiry_id}:{self.channel}"


class InquiryStatusHistory(models.Model):
    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE, related_name="history")
    from_status = models.CharField(max_length=18, blank=True)
    to_status = models.CharField(max_length=18)
    by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    note = models.CharField(max_length=300, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]

    def __str__(self) -> str:
        return f"{self.inquiry_id}:{self.to_status}"
