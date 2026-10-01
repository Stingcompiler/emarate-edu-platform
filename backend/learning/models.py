"""Lectures, assignments, submissions and grading (docs/05 §6 learning)."""

from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.models import PublicIdModel, TimestampedModel


class Lecture(PublicIdModel, TimestampedModel):
    class Type(models.TextChoices):
        THEORY = "theory", "نظري"
        LAB = "lab", "عملي"

    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.CASCADE, related_name="lectures"
    )
    title_ar = models.CharField(max_length=200)
    title_en = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=1)
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.THEORY)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["offering", "order", "id"]
        indexes = [models.Index(fields=["offering", "is_published"])]

    def __str__(self) -> str:
        return self.title_ar


class LectureView(models.Model):
    """A student opened a published lecture: once per student, with when and how often.

    The student's own reading state (like a notification's read_at), so not audited. Staff see
    how many students opened each lecture (docs/07 teacher lectures).
    """

    lecture = models.ForeignKey(Lecture, on_delete=models.CASCADE, related_name="views")
    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.CASCADE, related_name="+"
    )
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    times = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["lecture", "student_record"], name="uniq_lecture_view")
        ]

    def __str__(self) -> str:
        return f"{self.student_record_id} → {self.lecture_id}"


class LectureResource(TimestampedModel):
    class Kind(models.TextChoices):
        FILE = "file", "ملف"
        VIDEO = "video", "فيديو"
        LINK = "link", "رابط"
        RECORDING = "recording", "تسجيل"

    lecture = models.ForeignKey(Lecture, on_delete=models.CASCADE, related_name="resources")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    title = models.CharField(max_length=200)
    file = models.ForeignKey(
        "files.StoredFile", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    video = models.ForeignKey(
        "files.VideoAsset", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    url = models.URLField(blank=True)
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["lecture", "order", "id"]
        constraints = [
            # Exactly one target: a file, a video or a URL.
            models.CheckConstraint(
                condition=(
                    models.Q(file__isnull=False, video__isnull=True, url="")
                    | models.Q(file__isnull=True, video__isnull=False, url="")
                    | (models.Q(file__isnull=True, video__isnull=True) & ~models.Q(url=""))
                ),
                name="resource_single_target",
            )
        ]

    def __str__(self) -> str:
        return self.title


class Assignment(PublicIdModel, TimestampedModel):
    class Type(models.TextChoices):
        HOMEWORK = "homework", "واجب"
        PROJECT = "project", "مشروع"
        REPORT = "report", "تقرير"
        LAB = "lab", "تجربة عملية"

    class LatePolicy(models.TextChoices):
        NONE = "none", "لا يُقبل التأخير"
        ALLOW = "allow", "يُقبل ويُعلَّم متأخرًا"
        PENALTY = "penalty", "يُقبل بخصم"

    class GradingMode(models.TextChoices):
        MANUAL = "manual", "يدوي"
        RULE = "rule", "بقواعد"

    class Status(models.TextChoices):
        DRAFT = "draft", "مسودة"
        PUBLISHED = "published", "منشور"
        CLOSED = "closed", "مغلق"

    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.CASCADE, related_name="assignments"
    )
    lecture = models.ForeignKey(
        Lecture, on_delete=models.SET_NULL, null=True, blank=True, related_name="assignments"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.HOMEWORK)
    opens_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField()
    late_until = models.DateTimeField(null=True, blank=True)
    late_policy = models.CharField(
        max_length=10, choices=LatePolicy.choices, default=LatePolicy.NONE
    )
    late_penalty_percent = models.PositiveSmallIntegerField(
        default=0, validators=[MaxValueValidator(100)]
    )
    max_grade = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal(10), validators=[MinValueValidator(0)]
    )
    # Any of "text", "file", "link".
    submission_types = models.JSONField(default=list)
    allowed_extensions = models.JSONField(default=list, blank=True)  # empty = platform default
    max_file_size_mb = models.PositiveSmallIntegerField(default=20)
    max_files = models.PositiveSmallIntegerField(default=3)
    allow_resubmission = models.BooleanField(default=True)
    grading_mode = models.CharField(
        max_length=10, choices=GradingMode.choices, default=GradingMode.MANUAL
    )
    rubric = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    reminder_sent_at = models.DateTimeField(null=True, blank=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["offering", "due_at", "id"]
        indexes = [models.Index(fields=["offering", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(late_until__isnull=True)
                | models.Q(late_until__gte=models.F("due_at")),
                name="assignment_late_after_due",
            ),
            models.CheckConstraint(
                condition=models.Q(late_penalty_percent__lte=100),
                name="assignment_penalty_range",
            ),
        ]

    def __str__(self) -> str:
        return self.title


class AssignmentLinkField(models.Model):
    """A named link the student must (or may) provide, e.g. "GitHub repository"."""

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="link_fields")
    label = models.CharField(max_length=100)
    required = models.BooleanField(default=True)
    url_pattern = models.CharField(max_length=200, blank=True, help_text="Optional regex.")

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["assignment", "label"], name="uniq_link_field_label")
        ]

    def __str__(self) -> str:
        return self.label


class Submission(PublicIdModel, TimestampedModel):
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name="submissions")
    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.PROTECT, related_name="submissions"
    )
    current_version = models.ForeignKey(
        "SubmissionVersion", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    first_submitted_at = models.DateTimeField()
    is_late = models.BooleanField(default=False)

    class Meta:
        ordering = ["assignment", "student_record__university_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "student_record"], name="uniq_submission_per_student"
            )
        ]

    def __str__(self) -> str:
        return f"{self.assignment.title} — {self.student_record.full_name_ar}"


class SubmissionVersion(models.Model):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="versions")
    version_no = models.PositiveSmallIntegerField()
    content = models.TextField(blank=True)
    files = models.JSONField(default=list)  # StoredFile public_ids
    links = models.JSONField(default=dict)  # label -> url
    submitted_at = models.DateTimeField()
    is_late = models.BooleanField(default=False)

    class Meta:
        ordering = ["submission", "version_no"]
        constraints = [
            models.UniqueConstraint(
                fields=["submission", "version_no"], name="uniq_submission_version"
            )
        ]

    def __str__(self) -> str:
        return f"{self.submission} · v{self.version_no}"


class SubmissionGrade(TimestampedModel):
    class Source(models.TextChoices):
        MANUAL = "manual", "يدوي"
        RULE = "rule", "بقواعد"
        AI_SUGGESTED = "ai_suggested", "مقترح ذكي"

    class Status(models.TextChoices):
        SUGGESTED = "suggested", "مقترح"
        APPROVED = "approved", "معتمد"

    submission = models.OneToOneField(Submission, on_delete=models.CASCADE, related_name="grade")
    score = models.DecimalField(max_digits=6, decimal_places=2)
    feedback = models.TextField(blank=True)
    rubric_scores = models.JSONField(default=dict, blank=True)
    source = models.CharField(max_length=15, choices=Source.choices)
    status = models.CharField(max_length=10, choices=Status.choices)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    graded_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(score__gte=0), name="grade_not_negative")
        ]

    def __str__(self) -> str:
        return f"{self.submission} · {self.score}"

    @property
    def final_score(self) -> Decimal:
        """Score after the late penalty, if the assignment uses one."""
        assignment = self.submission.assignment
        if self.submission.is_late and assignment.late_policy == Assignment.LatePolicy.PENALTY:
            factor = Decimal(100 - assignment.late_penalty_percent) / 100
            return (self.score * factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return self.score
