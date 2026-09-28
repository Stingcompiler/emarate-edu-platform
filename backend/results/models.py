"""Academic results imported from the college's file (docs/05 §6 results, §8.4).

The file is the source of truth: nobody types grades into the platform. A
committed result changes only through an approved ResultCorrection.
"""

from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.models import PublicIdModel, SingletonModel, TimestampedModel

DEFAULT_RANGES = [
    {"min": 85, "letter": "A", "points": "4.00"},
    {"min": 75, "letter": "B+", "points": "3.50"},
    {"min": 70, "letter": "B", "points": "3.00"},
    {"min": 65, "letter": "C+", "points": "2.50"},
    {"min": 60, "letter": "C", "points": "2.00"},
    {"min": 0, "letter": "F", "points": "0.00"},
]


class GradingScale(TimestampedModel):
    """Score → letter/points. One per program; the row without a program is the default."""

    program = models.OneToOneField(
        "organization.Program",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="grading_scale",
    )
    ranges = models.JSONField(default=list)  # [{"min": 85, "letter": "A", "points": "4.00"}, ...]

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["program"],
                condition=models.Q(program__isnull=True),
                name="one_default_grading_scale",
            )
        ]

    def __str__(self) -> str:
        return f"scale:{self.program_id or 'default'}"

    @classmethod
    def for_program(cls, program_id) -> list[dict]:
        row = (
            cls.objects.filter(program_id=program_id).first()
            or cls.objects.filter(program__isnull=True).first()
        )
        return row.ranges if row and row.ranges else DEFAULT_RANGES

    @staticmethod
    def grade(ranges: list[dict], score: Decimal) -> tuple[str, Decimal]:
        for band in sorted(ranges, key=lambda b: -Decimal(str(b["min"]))):
            if score >= Decimal(str(band["min"])):
                return band["letter"], Decimal(str(band["points"]))
        return "F", Decimal(0)


class ResultImportBatch(PublicIdModel, TimestampedModel):
    class Scope(models.TextChoices):
        COLLEGE = "college", "الكلية"
        DEPARTMENT = "department", "قسم"

    class Status(models.TextChoices):
        VALIDATED = "validated", "جاهز للاعتماد"
        HAS_ERRORS = "has_errors", "به أخطاء"
        COMMITTED = "committed", "معتمد"
        PUBLISHED = "published", "منشور"
        UNPUBLISHED = "unpublished", "أُلغي نشره"
        REJECTED = "rejected", "مرفوض"

    file = models.FileField(upload_to="imports/results/%Y/%m/")
    file_name = models.CharField(max_length=255)
    scope = models.CharField(max_length=12, choices=Scope.choices)
    department = models.ForeignKey(
        "organization.Department", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    term = models.ForeignKey("academic.Term", on_delete=models.PROTECT, related_name="+")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=12, choices=Status.choices)
    detected_columns = models.JSONField(default=list)
    summary = models.JSONField(default=dict)
    committed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.file_name


class ResultImportRow(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "إنشاء"
        ERROR = "error", "خطأ"

    batch = models.ForeignKey(ResultImportBatch, on_delete=models.CASCADE, related_name="rows")
    row_no = models.PositiveIntegerField()
    raw = models.JSONField(default=dict)
    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    normalized = models.JSONField(default=dict)
    action = models.CharField(max_length=10, choices=Action.choices)
    errors = models.JSONField(default=list)

    class Meta:
        ordering = ["row_no"]
        constraints = [
            models.UniqueConstraint(fields=["batch", "row_no"], name="uniq_result_import_row")
        ]

    def __str__(self) -> str:
        return f"{self.batch_id}:{self.row_no}"


class AcademicResult(TimestampedModel):
    class Status(models.TextChoices):
        PASS = "pass", "ناجح"
        FAIL = "fail", "راسب"
        INCOMPLETE = "incomplete", "غير مكتمل"
        WITHDRAWN = "withdrawn", "منسحب"
        ABSENT = "absent", "غائب"

    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.PROTECT, related_name="results"
    )
    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.PROTECT, related_name="results"
    )
    term = models.ForeignKey("academic.Term", on_delete=models.PROTECT, related_name="+")
    score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    letter = models.CharField(max_length=4, blank=True)
    grade_points = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal(0))
    status = models.CharField(max_length=12, choices=Status.choices)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    import_batch = models.ForeignKey(
        ResultImportBatch, on_delete=models.PROTECT, related_name="results"
    )
    version = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["term", "offering__course__code"]
        indexes = [models.Index(fields=["student_record", "term", "is_published"])]
        constraints = [
            models.UniqueConstraint(
                fields=["student_record", "offering"], name="uniq_result_per_offering"
            )
        ]

    def __str__(self) -> str:
        record, course = self.student_record.university_number, self.offering.course.code
        return f"{record} · {course} {self.letter}"


class ResultCorrection(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "بانتظار الموافقة"
        APPROVED = "approved", "موافق عليه"
        REJECTED = "rejected", "مرفوض"

    result = models.ForeignKey(AcademicResult, on_delete=models.PROTECT, related_name="corrections")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    old = models.JSONField(default=dict)
    new = models.JSONField(default=dict)
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # At most one open request per result.
            models.UniqueConstraint(
                fields=["result"],
                condition=models.Q(status="pending"),
                name="one_pending_correction",
            )
        ]

    def __str__(self) -> str:
        return f"تعديل: {self.result}"


class ResultDisplaySettings(SingletonModel):
    show_score = models.BooleanField(default=True)
    show_letter = models.BooleanField(default=True)
    show_points = models.BooleanField(default=True)
    show_gpa = models.BooleanField(default=True)
    history_open = models.BooleanField(
        default=True, help_text="Students see earlier terms, not only the latest released one."
    )
    notice_text = models.TextField(blank=True)

    def __str__(self) -> str:
        return "result display settings"


class TermResultRelease(TimestampedModel):
    """Hide a term's published results from students (all, or one program's)."""

    term = models.ForeignKey("academic.Term", on_delete=models.CASCADE, related_name="+")
    program = models.ForeignKey(
        "organization.Program", on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    is_visible = models.BooleanField(default=True)
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )

    class Meta:
        ordering = ["term", "program"]
        constraints = [
            models.UniqueConstraint(fields=["term", "program"], name="uniq_term_release"),
            models.UniqueConstraint(
                fields=["term"],
                condition=models.Q(program__isnull=True),
                name="uniq_term_release_all_programs",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.term.name_ar} · {self.program.name_ar if self.program_id else 'كل البرامج'}"
