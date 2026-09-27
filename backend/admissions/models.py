"""Admissions: cycles, program intakes, form templates, applications (docs/02 §4.11)."""

import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import PublicIdModel, TimestampedModel


class AdmissionCycle(TimestampedModel):
    academic_year = models.ForeignKey(
        "academic.AcademicYear", on_delete=models.PROTECT, related_name="+"
    )
    name = models.CharField(max_length=100)
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-opens_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(closes_at__gt=models.F("opens_at")), name="cycle_window_order"
            )
        ]

    def __str__(self) -> str:
        return self.name


class ApplicationFormTemplate(TimestampedModel):
    """Steps → sections → fields (docs/03 §5). Publishing freezes a version."""

    class Status(models.TextChoices):
        DRAFT = "draft", "مسودة"
        PUBLISHED = "published", "منشور"
        RETIRED = "retired", "متقاعد"

    name = models.CharField(max_length=100)
    version = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    schema = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["name", "-version"]
        constraints = [
            models.UniqueConstraint(fields=["name", "version"], name="uniq_template_version")
        ]

    def __str__(self) -> str:
        return f"{self.name} v{self.version}"


class ProgramIntake(TimestampedModel):
    cycle = models.ForeignKey(AdmissionCycle, on_delete=models.CASCADE, related_name="intakes")
    program = models.ForeignKey(
        "organization.Program", on_delete=models.PROTECT, related_name="intakes"
    )
    form_template = models.ForeignKey(
        ApplicationFormTemplate,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="Empty = the college's default published template.",
    )
    is_open = models.BooleanField(default=True)
    opens_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(null=True, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    requirements_ar = models.TextField(blank=True)
    requirements_en = models.TextField(blank=True)
    # [{"key": "certificate", "label": "الشهادة الثانوية", "required": true}, ...]
    required_documents = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["cycle", "program__name_ar"]
        constraints = [
            models.UniqueConstraint(fields=["cycle", "program"], name="uniq_intake_program")
        ]

    def __str__(self) -> str:
        return f"{self.cycle_id}:{self.program_id}"

    def accepting(self, now=None) -> bool:
        now = now or timezone.now()
        opens = self.opens_at or self.cycle.opens_at
        closes = self.closes_at or self.cycle.closes_at
        return self.is_open and self.cycle.is_active and opens <= now < closes


class Application(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "مسودة"
        SUBMITTED = "submitted", "مُقدَّم"
        UNDER_REVIEW = "under_review", "قيد المراجعة"
        MISSING_DOCUMENTS = "missing_documents", "مستندات ناقصة"
        ELIGIBLE = "eligible", "مؤهل"
        ACCEPTED = "accepted", "مقبول"
        REJECTED = "rejected", "مرفوض"
        WAITLISTED = "waitlisted", "قائمة الانتظار"
        REGISTERED = "registered", "سُجّل طالبًا"
        ACTIVATED = "activated", "فعّل حسابه"
        WITHDRAWN = "withdrawn", "منسحب"
        EXPIRED = "expired", "منتهٍ"

    reference_no = models.CharField(max_length=20, unique=True)
    contact = models.ForeignKey(
        "contacts.Contact", on_delete=models.PROTECT, related_name="applications"
    )
    intake = models.ForeignKey(ProgramIntake, on_delete=models.PROTECT, related_name="applications")
    form_template = models.ForeignKey(
        ApplicationFormTemplate, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    # Fixed fields every template carries (docs/03 §5); the rest lives in answers.
    full_name = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    phone_e164 = models.CharField(max_length=20, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    assigned_registrar = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    student_record = models.OneToOneField(
        "students.StudentRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="application",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["intake", "status"]), models.Index(fields=["contact"])]

    def __str__(self) -> str:
        return self.reference_no

    @property
    def department_id(self) -> int:
        return self.intake.program.department_id


def _document_path(instance, filename: str) -> str:
    ext = PurePosixPath(filename).suffix.lower()[:10]
    return f"applications/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"


class ApplicationDocument(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "بانتظار المراجعة"
        ACCEPTED = "accepted", "مقبول"
        REJECTED = "rejected", "مرفوض"

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=50)
    file = models.FileField(upload_to=_document_path, max_length=255)
    name = models.CharField(max_length=255)
    size = models.PositiveIntegerField()
    mime = models.CharField(max_length=100)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["application", "doc_type", "id"]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.doc_type}"


class ApplicationStatusHistory(models.Model):
    """Append-only (docs/01 K.4)."""

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="history")
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="Empty = the applicant or the system.",
    )
    note = models.CharField(max_length=500, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.to_status}"


class ApplicationMessage(models.Model):
    class Channel(models.TextChoices):
        PORTAL = "portal", "صفحة المتابعة"
        EMAIL = "email", "بريد"
        INTERNAL = "internal", "ملاحظة داخلية"

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    channel = models.CharField(max_length=10, choices=Channel.choices)
    body = models.TextField(max_length=4000)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sent_at", "id"]

    def __str__(self) -> str:
        return f"{self.application_id}:{self.channel}"


class ApplicationAssignment(models.Model):
    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="assignments"
    )
    registrar = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]

    def __str__(self) -> str:
        return f"{self.application_id}→{self.registrar_id}"
