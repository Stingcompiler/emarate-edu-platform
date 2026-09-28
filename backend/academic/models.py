"""Terms, course catalogue, offerings, teaching staff and enrollment (docs/05 §6 academic)."""

from django.conf import settings
from django.db import models

from core.models import BilingualNameModel, PublicIdModel, TimestampedModel


class AcademicYear(TimestampedModel):
    name = models.CharField(max_length=20, unique=True)  # "2026/2027"
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        ordering = ["-starts_on"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__gt=models.F("starts_on")), name="year_dates_order"
            ),
            models.UniqueConstraint(
                fields=["is_current"],
                condition=models.Q(is_current=True),
                name="one_current_academic_year",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Term(BilingualNameModel, TimestampedModel):
    class Status(models.TextChoices):
        PLANNED = "planned", "مخطط"
        ACTIVE = "active", "جارٍ"
        CLOSED = "closed", "مغلق"

    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="terms")
    order = models.PositiveSmallIntegerField()  # 1 = autumn, 2 = spring, 3 = summer
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_current = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNED)

    class Meta:
        ordering = ["-starts_on"]
        constraints = [
            models.UniqueConstraint(fields=["academic_year", "order"], name="uniq_term_order"),
            models.UniqueConstraint(
                fields=["is_current"], condition=models.Q(is_current=True), name="one_current_term"
            ),
            models.CheckConstraint(
                condition=models.Q(ends_on__gt=models.F("starts_on")), name="term_dates_order"
            ),
        ]

    @classmethod
    def current(cls):
        return cls.objects.filter(is_current=True).first()


class Course(BilingualNameModel, TimestampedModel):
    """Catalogue entry. What students take in a term is a CourseOffering."""

    department = models.ForeignKey(
        "organization.Department", on_delete=models.PROTECT, related_name="courses"
    )
    program = models.ForeignKey(
        "organization.Program",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="courses",
        help_text="Empty = shared by the department's programs.",
    )
    code = models.CharField(max_length=20)
    credit_hours = models.PositiveSmallIntegerField(default=3)
    default_level = models.PositiveSmallIntegerField(default=1)
    default_term_order = models.PositiveSmallIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(fields=["department", "code"], name="uniq_course_code"),
            models.CheckConstraint(
                condition=models.Q(credit_hours__gte=1, credit_hours__lte=12),
                name="course_credit_hours_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} {self.name_ar}"


class CourseOffering(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "مسودة"
        ACTIVE = "active", "مفتوح"
        CLOSED = "closed", "مغلق"

    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="offerings")
    term = models.ForeignKey(Term, on_delete=models.PROTECT, related_name="offerings")
    section = models.CharField(max_length=10, default="A")
    capacity = models.PositiveIntegerField(null=True, blank=True)
    ta_can_grade = models.BooleanField(default=False)
    ta_can_notify = models.BooleanField(
        default=False, help_text="TAs may send notifications to this course's students."
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        ordering = ["course__code", "section"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "term", "section"], name="uniq_offering_section"
            )
        ]

    def __str__(self) -> str:
        return f"{self.course.code}-{self.section} · {self.term.name_ar}"

    @property
    def department_id(self) -> int:
        return self.course.department_id


class OfferingInstructor(TimestampedModel):
    class Kind(models.TextChoices):
        TEACHER = "teacher", "أستاذ"
        TA = "ta", "معيد"

    offering = models.ForeignKey(
        CourseOffering, on_delete=models.CASCADE, related_name="instructors"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="teaching"
    )
    role = models.CharField(max_length=10, choices=Kind.choices)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["offering", "user"], name="uniq_offering_instructor")
        ]


class DepartmentMembership(TimestampedModel):
    """A teacher or TA belonging to a department (managed by the department)."""

    class Kind(models.TextChoices):
        TEACHER = "teacher", "أستاذ"
        TA = "ta", "معيد"

    department = models.ForeignKey(
        "organization.Department", on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="department_memberships"
    )
    kind = models.CharField(max_length=10, choices=Kind.choices)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["department", "user"], name="uniq_department_member")
        ]


class Enrollment(TimestampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "مسجل"
        DROPPED = "dropped", "منسحب"
        COMPLETED = "completed", "مكتمل"

    class Source(models.TextChoices):
        MANUAL = "manual", "يدوي"
        BULK = "bulk", "جماعي"
        AUTO = "auto", "تلقائي بالمستوى"

    offering = models.ForeignKey(
        CourseOffering, on_delete=models.PROTECT, related_name="enrollments"
    )
    student_record = models.ForeignKey(
        "students.StudentRecord", on_delete=models.PROTECT, related_name="enrollments"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["offering", "student_record"], name="uniq_enrollment")
        ]
        indexes = [models.Index(fields=["student_record", "status"])]
