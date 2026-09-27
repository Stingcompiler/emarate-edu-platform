"""Online exams with server-timed attempts (docs/05 §6 exams, §8.5)."""

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from core.models import PublicIdModel, TimestampedModel


class Exam(PublicIdModel, TimestampedModel):
    class Visibility(models.TextChoices):
        IMMEDIATE = "immediate", "فور الإرسال"
        AFTER_CLOSE = "after_close", "بعد الإغلاق"
        MANUAL = "manual", "يدويًا"

    class Status(models.TextChoices):
        DRAFT = "draft", "مسودة"
        PUBLISHED = "published", "منشور"
        CLOSED = "closed", "مغلق"
        ARCHIVED = "archived", "مؤرشف"

    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.CASCADE, related_name="exams"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    grace_seconds = models.PositiveSmallIntegerField(default=30)
    pass_marks = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal(0))
    max_attempts = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1)])
    allow_backtrack = models.BooleanField(default=True)
    shuffle_questions = models.BooleanField(default=False)
    shuffle_choices = models.BooleanField(default=False)
    result_visibility = models.CharField(
        max_length=12, choices=Visibility.choices, default=Visibility.IMMEDIATE
    )
    show_answers = models.BooleanField(
        default=False, help_text="Let students review correct answers and explanations."
    )
    results_released = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    reminder_sent_at = models.DateTimeField(null=True, blank=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-opens_at", "-id"]
        indexes = [
            models.Index(fields=["offering", "status"]),
            models.Index(fields=["status", "closes_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(closes_at__gt=models.F("opens_at")), name="exam_window_order"
            )
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def total_marks(self) -> Decimal:
        return sum((q.marks for q in self.questions.all()), Decimal(0))


class Question(TimestampedModel):
    class Type(models.TextChoices):
        SINGLE = "single", "اختيار واحد"
        MULTIPLE = "multiple", "اختيارات متعددة"
        TRUE_FALSE = "true_false", "صح / خطأ"
        FILL_BLANK = "fill_blank", "إكمال فراغ"
        SHORT_ANSWER = "short_answer", "إجابة قصيرة"
        ESSAY = "essay", "مقالي"

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveSmallIntegerField(default=1)
    type = models.CharField(max_length=14, choices=Type.choices)
    text = models.TextField()
    marks = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal(1), validators=[MinValueValidator(0)]
    )
    explanation = models.TextField(blank=True)
    # multiple: {"partial": true}; true_false: {"answer": true}; fill_blank: {"accepted": [...]}
    config = models.JSONField(default=dict, blank=True)
    is_required = models.BooleanField(default=False)

    class Meta:
        ordering = ["exam", "order", "id"]

    def __str__(self) -> str:
        return self.text[:60]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="choices")
    order = models.PositiveSmallIntegerField(default=1)
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)

    class Meta:
        ordering = ["question", "order", "id"]

    def __str__(self) -> str:
        return self.text[:60]


class ExamAttempt(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "جارية"
        SUBMITTED = "submitted", "أُرسلت"
        AUTO_SUBMITTED = "auto_submitted", "أُرسلت تلقائيًا"
        INVALIDATED = "invalidated", "أُلغيت"

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="attempts")
    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.PROTECT, related_name="exam_attempts"
    )
    attempt_no = models.PositiveSmallIntegerField(default=1)
    started_at = models.DateTimeField()
    deadline_at = models.DateTimeField()
    submitted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IN_PROGRESS)
    score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)
    question_order = models.JSONField(default=list)  # question ids in the order shown
    choice_orders = models.JSONField(default=dict)  # {question_id: [choice ids]}
    client_meta = models.JSONField(default=dict, blank=True)  # focus losses, offline periods
    last_saved_at = models.DateTimeField(null=True, blank=True)
    invalidation_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["exam", "student_record__university_number", "attempt_no"]
        indexes = [models.Index(fields=["status", "deadline_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["exam", "student_record", "attempt_no"], name="uniq_attempt_no"
            ),
            models.UniqueConstraint(
                fields=["exam", "student_record"],
                condition=models.Q(status="in_progress"),
                name="one_attempt_in_progress",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.exam_id}:{self.student_record_id}#{self.attempt_no}"


class StudentAnswer(models.Model):
    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="answers")
    answer = models.JSONField(null=True, blank=True)
    saved_at = models.DateTimeField()
    is_correct = models.BooleanField(null=True, blank=True)
    marks_awarded = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    needs_manual = models.BooleanField(default=False)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["attempt", "question__order"]
        constraints = [
            models.UniqueConstraint(fields=["attempt", "question"], name="uniq_answer_per_question")
        ]

    def __str__(self) -> str:
        return f"{self.attempt_id}:{self.question_id}"
