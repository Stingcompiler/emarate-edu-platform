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
    # The college's year has two semesters (owner, 2026-11-05): 1 = «الفصل الدراسي الأول»,
    # 2 = «الفصل الدراسي الثاني»; no summer term. New terms take 1 or 2 (TermSerializer).
    order = models.PositiveSmallIntegerField()
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
    """Catalogue entry. What students take in a term is a CourseOffering.

    A course belongs to one programme (owner, 2026-11-13: two programmes may name a course
    alike and teach it differently, so nothing is shared); the department is only the
    programme's container and is kept here, derived, for department-wide lists. Courses entered
    before that with no programme stay as they were until someone gives them one."""

    # Derived from the programme on save.
    department = models.ForeignKey(
        "organization.Department", on_delete=models.PROTECT, related_name="courses"
    )
    program = models.ForeignKey(
        "organization.Program",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="courses",
        help_text="Empty only on courses entered before 2026-11-13 (then shared by the "
        "department's programmes).",
    )
    code = models.CharField(max_length=20)
    credit_hours = models.PositiveSmallIntegerField(default=3)
    default_level = models.PositiveSmallIntegerField(default=1)
    # Where the course sits in the study plan: level 1–5 (a year), and the semester of that
    # level, 1 or 2 (owner, 2026-11-05). Bulk enrollment in a term takes the term's semester.
    default_term_order = models.PositiveSmallIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        constraints = [
            # A code names one course of a programme; two programmes may use the same code.
            models.UniqueConstraint(
                fields=["program", "code"],
                condition=models.Q(program__isnull=False),
                name="uniq_program_course_code",
            ),
            models.UniqueConstraint(
                fields=["department", "code"],
                condition=models.Q(program__isnull=True),
                name="uniq_department_course_code",
            ),
            models.CheckConstraint(
                condition=models.Q(credit_hours__gte=1, credit_hours__lte=12),
                name="course_credit_hours_range",
            ),
            models.CheckConstraint(
                condition=models.Q(default_term_order__gte=1, default_term_order__lte=2),
                name="course_semester_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} {self.name_ar}"

    def save(self, *args, **kwargs):
        if self.program_id is not None:
            self.department_id = self.program.department_id
        super().save(*args, **kwargs)


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
    """A teacher or TA linked to a programme — any programme of any department, as many as they
    teach in (owner, 2026-11-13). The department is the programme's, derived on save; a
    membership from before that with no programme belongs to the whole department."""

    class Kind(models.TextChoices):
        TEACHER = "teacher", "أستاذ"
        TA = "ta", "معيد"

    department = models.ForeignKey(
        "organization.Department", on_delete=models.CASCADE, related_name="memberships"
    )
    program = models.ForeignKey(
        "organization.Program",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="memberships",
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
            models.UniqueConstraint(
                fields=["program", "user"],
                condition=models.Q(program__isnull=False),
                name="uniq_program_member",
            ),
            models.UniqueConstraint(
                fields=["department", "user"],
                condition=models.Q(program__isnull=True),
                name="uniq_department_member",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.program_id is not None:
            self.department_id = self.program.department_id
        super().save(*args, **kwargs)


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
