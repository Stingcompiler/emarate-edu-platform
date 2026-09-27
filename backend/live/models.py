"""Live sessions: links to Teams/Meet/Zoom for a course or a cohort (docs/02 §4.9)."""

from django.conf import settings
from django.db import models

from core.crypto import decrypt, encrypt
from core.models import PublicIdModel, TimestampedModel


class LiveSession(PublicIdModel, TimestampedModel):
    class Scope(models.TextChoices):
        OFFERING = "offering", "مادة"
        COHORT = "cohort", "دفعة (برنامج ومستوى)"

    class Provider(models.TextChoices):
        TEAMS = "teams", "Microsoft Teams"
        MEET = "meet", "Google Meet"
        ZOOM = "zoom", "Zoom"
        OTHER = "other", "أخرى"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "مجدولة"
        CANCELLED = "cancelled", "ملغاة"

    scope = models.CharField(max_length=10, choices=Scope.choices)
    offering = models.ForeignKey(
        "academic.CourseOffering",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="live_sessions",
    )
    program = models.ForeignKey(
        "organization.Program", on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    level = models.PositiveSmallIntegerField(null=True, blank=True)
    title = models.CharField(max_length=200)
    provider = models.CharField(max_length=10, choices=Provider.choices)
    join_url_encrypted = models.TextField(help_text="Encrypted at rest (core.crypto).")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SCHEDULED)
    recording_url = models.URLField(blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["starts_at", "id"]
        indexes = [models.Index(fields=["starts_at", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(
                        scope="offering",
                        offering__isnull=False,
                        program__isnull=True,
                        level__isnull=True,
                    )
                    | models.Q(
                        scope="cohort",
                        offering__isnull=True,
                        program__isnull=False,
                        level__isnull=False,
                    )
                ),
                name="live_session_single_scope",
            ),
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")),
                name="live_session_time_order",
            ),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def join_url(self) -> str:
        return decrypt(self.join_url_encrypted)

    @join_url.setter
    def join_url(self, value: str) -> None:
        self.join_url_encrypted = encrypt(value)

    @property
    def department_id(self) -> int:
        return (
            self.offering.course.department_id if self.offering_id else self.program.department_id
        )
