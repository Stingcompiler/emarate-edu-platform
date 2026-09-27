"""In-app, Web Push and email notifications (docs/02 §5, docs/05 §6)."""

from django.conf import settings
from django.db import models

from core.models import PublicIdModel, TimestampedModel


class Category(models.TextChoices):
    COURSE = "course", "المواد"
    COLLEGE = "college", "الكلية"
    RESULTS = "results", "النتائج"
    ACCOUNT = "account", "الحساب"
    HR = "hr", "الموارد البشرية"


class Channel(models.TextChoices):
    INAPP = "inapp", "داخل التطبيق"
    PUSH = "push", "Push"
    EMAIL = "email", "بريد"


class Notification(PublicIdModel, TimestampedModel):
    class Kind(models.TextChoices):
        MANUAL = "manual", "يدوي"
        SYSTEM = "system", "تلقائي"
        HR_NOTICE = "hr_notice", "تنبيه موارد بشرية"

    class Priority(models.TextChoices):
        NORMAL = "normal", "عادي"
        URGENT = "urgent", "عاجل"

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="Empty for system notifications.",
    )
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.MANUAL)
    category = models.CharField(max_length=10, choices=Category.choices)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    title = models.CharField(max_length=160)
    body = models.TextField(max_length=2000, blank=True)
    action_url = models.CharField(max_length=300, blank=True)
    audience = models.JSONField(default=dict)
    channels = models.JSONField(default=list)
    recipients_count = models.PositiveIntegerField(default=0)
    fanned_out_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class NotificationRecipient(models.Model):
    notification = models.ForeignKey(
        Notification, on_delete=models.CASCADE, related_name="recipients"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    delivered_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        indexes = [models.Index(fields=["user", "read_at"])]
        constraints = [
            models.UniqueConstraint(fields=["notification", "user"], name="uniq_recipient")
        ]

    def __str__(self) -> str:
        return f"{self.notification_id}→{self.user_id}"


class PushSubscription(TimestampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions"
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    user_agent = models.CharField(max_length=255, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.user_id}: {self.endpoint[:40]}"


class NotificationPreference(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preferences"
    )
    category = models.CharField(max_length=10, choices=Category.choices)
    inapp = models.BooleanField(default=True)
    push = models.BooleanField(default=True)
    email = models.BooleanField(default=False)

    class Meta:
        ordering = ["category"]
        constraints = [models.UniqueConstraint(fields=["user", "category"], name="uniq_preference")]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.category}"


class HRNotice(PublicIdModel, TimestampedModel):
    """A directed notice from HR to one teacher; it stays in the teacher's file."""

    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="hr_notices"
    )
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    subject = models.CharField(max_length=160)
    body = models.TextField(max_length=4000)
    requires_ack = models.BooleanField(default=False)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    notification = models.ForeignKey(
        Notification, on_delete=models.SET_NULL, null=True, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.subject


class Outbox(TimestampedModel):
    """Email deliveries with retries (push is sent directly by the fan-out task)."""

    class Status(models.TextChoices):
        PENDING = "pending", "بانتظار الإرسال"
        SENT = "sent", "أُرسل"
        FAILED = "failed", "فشل"

    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.EMAIL)
    to = models.EmailField()
    subject = models.CharField(max_length=200)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_try_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["status", "next_try_at"])]

    def __str__(self) -> str:
        return f"{self.to}: {self.subject}"
