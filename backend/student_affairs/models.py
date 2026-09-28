"""Regulations, student cases and misconduct reports (docs/03 §3.14, docs/05 §6)."""

from django.conf import settings
from django.db import models

from core.models import PublicIdModel, TimestampedModel


class Regulation(PublicIdModel, TimestampedModel):
    class Category(models.TextChoices):
        ACADEMIC = "academic", "أكاديمية"
        EXAMS = "exams", "الامتحانات"
        CONDUCT = "conduct", "السلوك"
        GENERAL = "general", "عامة"

    class Status(models.TextChoices):
        DRAFT = "draft", "مسودة"
        PUBLISHED = "published", "منشورة"
        SUPERSEDED = "superseded", "مستبدلة"

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    file = models.ForeignKey(
        "files.StoredFile", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    category = models.CharField(max_length=10, choices=Category.choices, default=Category.GENERAL)
    version = models.CharField(max_length=20, default="1")
    effective_from = models.DateField(null=True, blank=True)
    requires_acknowledgement = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    replaces = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="The version this one supersedes when published.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-published_at", "-created_at"]

    def __str__(self) -> str:
        return self.title


class RegulationAcknowledgement(models.Model):
    regulation = models.ForeignKey(
        Regulation, on_delete=models.CASCADE, related_name="acknowledgements"
    )
    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.CASCADE, related_name="acknowledgements"
    )
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-at"]
        constraints = [
            models.UniqueConstraint(
                fields=["regulation", "student_record"], name="uniq_acknowledgement"
            )
        ]

    def __str__(self) -> str:
        return f"{self.regulation} — {self.student_record.full_name_ar}"


class StudentCase(PublicIdModel, TimestampedModel):
    class Kind(models.TextChoices):
        ACADEMIC = "academic", "حالة أكاديمية"
        EXAM_MISCONDUCT = "exam_misconduct", "غش امتحان"
        CONDUCT = "conduct", "مخالفة سلوكية"
        WELFARE = "welfare", "حالة اجتماعية/صحية"

    class Status(models.TextChoices):
        OPEN = "open", "مفتوحة"
        DECIDED = "decided", "صدر قرار"
        CLOSED = "closed", "مغلقة"

    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.PROTECT, related_name="cases"
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    attachments = models.JSONField(default=list, blank=True)  # StoredFile public_ids (purpose=case)
    decision = models.TextField(blank=True)
    sanction = models.CharField(max_length=200, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    published_to_student = models.BooleanField(default=False)
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["student_record", "status"])]

    def __str__(self) -> str:
        return self.title


class StudentCaseEvent(models.Model):
    class Kind(models.TextChoices):
        OPENED = "opened", "فُتحت"
        NOTE = "note", "ملاحظة"
        DECIDED = "decided", "قرار"
        PUBLISHED = "published", "نُشرت للطالب"
        CLOSED = "closed", "أُغلقت"
        REOPENED = "reopened", "أُعيد فتحها"

    case = models.ForeignKey(StudentCase, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    note = models.TextField(blank=True)
    by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]

    def __str__(self) -> str:
        return f"{self.case_id}:{self.kind}"


class MisconductReport(PublicIdModel, TimestampedModel):
    """A teacher's report of cheating (optionally on an exam attempt); student
    affairs converts it into a case or dismisses it."""

    class Status(models.TextChoices):
        NEW = "new", "جديد"
        CONVERTED = "converted", "حُوّل إلى حالة"
        DISMISSED = "dismissed", "رُفض"

    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.PROTECT, related_name="misconduct_reports"
    )
    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.PROTECT, related_name="misconduct_reports"
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    evidence = models.TextField()
    attempt = models.ForeignKey(
        "exams.ExamAttempt",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="misconduct_reports",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.NEW)
    case = models.ForeignKey(
        StudentCase, on_delete=models.SET_NULL, null=True, blank=True, related_name="reports"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"report:{self.student_record_id}"
