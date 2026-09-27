"""Official student records, owned by the college (docs/02 D3, docs/05 §6 students).

Records are created only by importing the college's file (validate → preview →
commit) or, from Phase 7, by converting an accepted application. Students
never edit their own name, program or level.
"""

from django.conf import settings
from django.db import models

from core.models import PublicIdModel, TimestampedModel


class StudentRecord(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "منتظم"
        SUSPENDED = "suspended", "موقوف"
        GRADUATED = "graduated", "متخرج"
        WITHDRAWN = "withdrawn", "منسحب"

    class Gender(models.TextChoices):
        MALE = "male", "ذكر"
        FEMALE = "female", "أنثى"

    university_number = models.CharField(max_length=30, unique=True)
    full_name_ar = models.CharField(max_length=200)
    full_name_en = models.CharField(max_length=200, blank=True)
    program = models.ForeignKey(
        "organization.Program", on_delete=models.PROTECT, related_name="students"
    )
    # Denormalized from program for fast department-scoped filtering.
    department = models.ForeignKey(
        "organization.Department", on_delete=models.PROTECT, related_name="students"
    )
    level = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_record",
    )
    email = models.EmailField(blank=True, help_text="Official email from the college file.")
    phone_e164 = models.CharField(max_length=20, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    nationality = models.CharField(max_length=60, blank=True)
    national_id_hash = models.CharField(max_length=128, blank=True)
    admitted_term = models.ForeignKey(
        "academic.Term", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["university_number"]
        indexes = [
            models.Index(fields=["program", "level", "status"]),
            models.Index(fields=["department", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(level__gte=1, level__lte=10), name="student_level_range"
            )
        ]

    def __str__(self) -> str:
        return f"{self.university_number} {self.full_name_ar}"

    def save(self, *args, **kwargs):
        self.department_id = self.program.department_id
        super().save(*args, **kwargs)


class StudentImportBatch(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        VALIDATED = "validated", "جاهز للاعتماد"
        HAS_ERRORS = "has_errors", "به أخطاء"
        COMMITTED = "committed", "معتمد"
        REJECTED = "rejected", "مرفوض"

    file_name = models.CharField(max_length=255)
    file = models.FileField(upload_to="imports/students/%Y/%m/")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=12, choices=Status.choices)
    summary = models.JSONField(default=dict)
    committed_at = models.DateTimeField(null=True, blank=True)
    committed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]


class StudentImportRow(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "إنشاء"
        UPDATE = "update", "تحديث"
        SKIP = "skip", "بلا تغيير"
        ERROR = "error", "خطأ"

    batch = models.ForeignKey(StudentImportBatch, on_delete=models.CASCADE, related_name="rows")
    row_no = models.PositiveIntegerField()
    raw = models.JSONField(default=dict)
    normalized = models.JSONField(default=dict)
    action = models.CharField(max_length=10, choices=Action.choices)
    changes = models.JSONField(default=dict)  # field -> [old, new] for updates
    errors = models.JSONField(default=list)

    class Meta:
        ordering = ["row_no"]
        constraints = [models.UniqueConstraint(fields=["batch", "row_no"], name="uniq_import_row")]

    def __str__(self) -> str:
        return f"{self.batch_id}:{self.row_no}"


class UniversityNumberSequence(models.Model):
    """Issues numbers like 26-IT-0117 when accepted applicants become students (Phase 7)."""

    college = models.ForeignKey("organization.College", on_delete=models.PROTECT)
    year = models.PositiveSmallIntegerField()
    prefix = models.CharField(max_length=10)
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["college", "year", "prefix"], name="uniq_university_number_sequence"
            )
        ]

    def __str__(self) -> str:
        return f"{self.year}-{self.prefix}"
