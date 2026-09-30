"""College structure and system-wide settings (docs/05 §6 organization)."""

from django.db import models

from core.models import BilingualNameModel, SingletonModel, TimestampedModel


class College(BilingualNameModel, TimestampedModel):
    """One row today; the schema allows more later."""

    code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_ar"]


class Department(BilingualNameModel, TimestampedModel):
    college = models.ForeignKey(College, on_delete=models.PROTECT, related_name="departments")
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_ar"]
        constraints = [
            models.UniqueConstraint(fields=["college", "code"], name="uniq_department_code")
        ]


class Program(BilingualNameModel, TimestampedModel):
    class Degree(models.TextChoices):
        DIPLOMA = "diploma", "دبلوم"
        BACHELOR = "bachelor", "بكالوريوس"
        HONOURS = "honours", "بكالوريوس مرتبة الشرف"
        MASTER = "master", "ماجستير"

    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="programs")
    code = models.CharField(max_length=20, unique=True)
    degree = models.CharField(max_length=20, choices=Degree.choices)
    levels_count = models.PositiveSmallIntegerField()
    duration_terms = models.PositiveSmallIntegerField()
    # Credit hours to graduate, as the college states them (owner decision 2026-09-28): the
    # public site shows this, never a sum of the courses entered so far. Blank → not shown.
    total_credit_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    # Public site copy (docs/02 §6); plain text, shown on the program page.
    description_ar = models.TextField(blank=True)
    description_en = models.TextField(blank=True)
    # What an applicant weighs first (landing review 2026-10, PR 6b): the yearly fee in
    # Sudanese pounds and, for international applicants, in US dollars. Blank → not shown.
    annual_fee_sdg = models.PositiveIntegerField(null=True, blank=True)
    annual_fee_usd = models.PositiveIntegerField(null=True, blank=True)
    # One item per line: what graduates can do, and where they work.
    outcomes_ar = models.TextField(blank=True)
    outcomes_en = models.TextField(blank=True)
    careers_ar = models.TextField(blank=True)
    careers_en = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["department__name_ar", "name_ar"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(levels_count__gte=1, levels_count__lte=10),
                name="program_levels_count_range",
            ),
            models.CheckConstraint(
                condition=models.Q(duration_terms__gte=1), name="program_duration_terms_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(total_credit_hours__isnull=True)
                | models.Q(total_credit_hours__gte=1, total_credit_hours__lte=300),
                name="program_total_credit_hours_range",
            ),
        ]


class SystemSettings(SingletonModel, TimestampedModel):
    """Switches that change who may do what (docs/03 §2). Only system_admin edits."""

    student_registration_requires_approval = models.BooleanField(default=True)
    applications_fallback_to_head_registrar = models.BooleanField(default=True)
    delegate_decisions_to_registrars = models.BooleanField(default=False)
    otp_ttl_minutes = models.PositiveSmallIntegerField(default=10)
    otp_max_attempts = models.PositiveSmallIntegerField(default=5)
    max_applications_per_cycle = models.PositiveSmallIntegerField(default=3)
    # Teacher-performance thresholds for reports and HR (docs/02 §4.14).
    grading_days_limit = models.PositiveSmallIntegerField(default=3)
    upload_min_percent = models.PositiveSmallIntegerField(default=75)
    planned_lectures_per_week = models.PositiveSmallIntegerField(default=2)

    class Meta:
        verbose_name = "system settings"
        verbose_name_plural = "system settings"

    def __str__(self) -> str:
        return "System settings"
