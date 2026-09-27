"""Private files and videos (docs/05 §7 «الملفات», §8.8).

Nothing here is ever served by a raw path: access goes through
``files.services.signed_url`` after the owning feature says the user may read
it (``files.access``).
"""

import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import PublicIdModel, TimestampedModel


class Purpose(models.TextChoices):
    LECTURE = "lecture", "مورد محاضرة"
    SUBMISSION = "submission", "تسليم واجب"
    REGULATION = "regulation", "لائحة"
    CASE = "case", "مرفق حالة طالب"


def _upload_to(instance, filename: str) -> str:
    # Never reuse the uploader's file name in the storage path.
    ext = PurePosixPath(filename).suffix.lower()[:10]
    now = timezone.now()
    return f"{instance.purpose}/{now:%Y/%m}/{uuid.uuid4().hex}{ext}"


class StoredFile(PublicIdModel, TimestampedModel):
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    offering = models.ForeignKey(
        "academic.CourseOffering",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="files",
        help_text="Course files only; regulations and case attachments have none.",
    )
    file = models.FileField(upload_to=_upload_to, max_length=255)
    name = models.CharField(max_length=255, help_text="Original name, shown on download.")
    size = models.PositiveBigIntegerField()
    mime = models.CharField(max_length=100)
    sha256 = models.CharField(max_length=64)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["purpose", "offering"])]

    def __str__(self) -> str:
        return self.name


class VideoAsset(PublicIdModel, TimestampedModel):
    """A lecture video: Bunny Stream in production, a local file in development."""

    class Provider(models.TextChoices):
        LOCAL = "local", "محلي"
        BUNNY = "bunny", "Bunny Stream"

    class Status(models.TextChoices):
        UPLOADING = "uploading", "قيد الرفع"
        PROCESSING = "processing", "قيد المعالجة"
        READY = "ready", "جاهز"
        FAILED = "failed", "فشل"

    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.PROTECT, related_name="videos"
    )
    title = models.CharField(max_length=200)
    provider = models.CharField(max_length=10, choices=Provider.choices)
    provider_id = models.CharField(max_length=64, blank=True, db_index=True)
    file = models.FileField(upload_to="videos/%Y/%m/", blank=True, max_length=255)
    size = models.PositiveBigIntegerField(default=0)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.UPLOADING)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
