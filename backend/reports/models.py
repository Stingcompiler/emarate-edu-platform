"""Frozen report snapshots (docs/02 §4.14)."""

from django.conf import settings
from django.db import models

from core.models import PublicIdModel, TimestampedModel


class ReportSnapshot(PublicIdModel, TimestampedModel):
    """An exported report, computed by the server and frozen (printed to PDF by the portal)."""

    class Kind(models.TextChoices):
        DEPARTMENT = "department", "تقرير القسم"
        TEACHERS = "teachers", "أداء هيئة التدريس"
        ADMISSIONS = "admissions", "القبول والتسجيل"
        AFFAIRS = "affairs", "شؤون الطلاب"

    kind = models.CharField(max_length=12, choices=Kind.choices)
    title = models.CharField(max_length=200)
    term = models.ForeignKey(
        "academic.Term", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    department = models.ForeignKey(
        "organization.Department",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    params = models.JSONField(default=dict, blank=True)
    data = models.JSONField(default=dict)
    notes = models.TextField(max_length=2000, blank=True)
    digest = models.CharField(max_length=64)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
