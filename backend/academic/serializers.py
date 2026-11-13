from django.contrib.auth import get_user_model
from django.utils.translation import gettext
from rest_framework import serializers

from organization.models import Program
from students.models import StudentRecord

from .models import (
    AcademicYear,
    Course,
    CourseOffering,
    DepartmentMembership,
    Enrollment,
    OfferingInstructor,
    Term,
)

User = get_user_model()


def _dates_in_order(serializer, attrs):
    """The database refuses an end on or before the start; say so instead of a 500 (R29)."""
    instance = serializer.instance
    starts = attrs.get("starts_on", getattr(instance, "starts_on", None))
    ends = attrs.get("ends_on", getattr(instance, "ends_on", None))
    if starts and ends and ends <= starts:
        raise serializers.ValidationError({"ends_on": gettext("The end must be after the start.")})
    return attrs


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "name", "starts_on", "ends_on", "is_current"]
        # The current year and term change together through «تعيين كحالي» (set-current).
        read_only_fields = ["is_current"]

    def validate(self, attrs):
        return _dates_in_order(self, attrs)


class TermSerializer(serializers.ModelSerializer):
    class Meta:
        model = Term
        fields = [
            "id",
            "academic_year",
            "name_ar",
            "name_en",
            "name",
            "order",
            "starts_on",
            "ends_on",
            "is_current",
            "status",
        ]
        read_only_fields = ["is_current", "name"]

    def validate_order(self, value):
        # Two semesters a year, no summer term (owner, 2026-11-05).
        if value not in (1, 2):
            raise serializers.ValidationError(gettext("The semester is 1 or 2."))
        return value

    def validate(self, attrs):
        return _dates_in_order(self, attrs)


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = [
            "id",
            "department",
            "program",
            "code",
            "name_ar",
            "name_en",
            "name",
            "credit_hours",
            "default_level",
            "default_term_order",
            "is_active",
        ]
        read_only_fields = ["name"]
        # The department is the programme's: sent or not, it is taken from the programme.
        extra_kwargs = {"department": {"required": False}}
        # The generated validators of the two code constraints would require the department:
        # the code is checked in validate() instead.
        validators = []

    def validate_default_term_order(self, value):
        if value not in (1, 2):
            raise serializers.ValidationError(gettext("The semester is 1 or 2."))
        return value

    def validate(self, attrs):
        program = attrs.get("program", getattr(self.instance, "program", None))
        level = attrs.get("default_level", getattr(self.instance, "default_level", 1))
        # A course belongs to one programme (owner, 2026-11-13). One entered before that with
        # none keeps working until it is given one; it is never taken away again.
        if program is None and (self.instance is None or "program" in attrs):
            raise serializers.ValidationError(
                {"program": [gettext("Choose the programme this course belongs to.")]}
            )
        if program is not None:
            department = attrs.get("department")
            if department is not None and program.department_id != department.pk:
                raise serializers.ValidationError(
                    {"program": [gettext("The program belongs to another department.")]}
                )
            attrs["department"] = program.department
        code = attrs.get("code", getattr(self.instance, "code", None))
        same = (
            Course.objects.filter(program=program, code=code)
            if program is not None
            else Course.objects.filter(
                program__isnull=True, department=self.instance.department, code=code
            )
        )
        if same.exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError(
                {"code": [gettext("This programme already has a course with this code.")]}
            )
            if level > program.levels_count:
                raise serializers.ValidationError(
                    {
                        "default_level": [
                            gettext("This program has %(levels_count)s levels.")
                            % {"levels_count": program.levels_count}
                        ]
                    }
                )
        return attrs


class PersonSerializer(serializers.ModelSerializer):
    # The profile photo's id, for /api/v1/photos/<id> (owner, 2026-10-30).
    photo = serializers.SlugRelatedField(slug_field="public_id", read_only=True)

    class Meta:
        model = User
        fields = ["public_id", "full_name_ar", "full_name_en", "email", "photo"]


class DirectoryPersonSerializer(PersonSerializer):
    """A person a department may add: ``kinds`` are the memberships their roles allow now
    («teacher», «ta»); empty for academic affairs who does not teach yet (review 2026-11-12)."""

    kinds = serializers.SerializerMethodField()

    class Meta(PersonSerializer.Meta):
        fields = [*PersonSerializer.Meta.fields, "kinds"]

    def get_kinds(self, user) -> list[str]:
        held = {r.role for r in user.role_assignments.all()}
        return [kind for kind, role in (("teacher", "teacher"), ("ta", "ta")) if role in held]


class InstructorSerializer(serializers.ModelSerializer):
    user = PersonSerializer(read_only=True)

    class Meta:
        model = OfferingInstructor
        fields = ["id", "user", "role"]


class InstructorAddSerializer(serializers.Serializer):
    user = serializers.SlugRelatedField(slug_field="public_id", queryset=User.objects.all())
    role = serializers.ChoiceField(choices=OfferingInstructor.Kind.choices)


class CourseSummarySerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name_ar", read_only=True, default=None)

    class Meta:
        model = Course
        fields = [
            "id",
            "program",
            "program_name",
            "code",
            "name_ar",
            "name_en",
            "name",
            "credit_hours",
            "default_level",
            "default_term_order",
        ]


class OfferingSerializer(serializers.ModelSerializer):
    course_detail = CourseSummarySerializer(source="course", read_only=True)
    instructors = InstructorSerializer(many=True, read_only=True)
    enrolled_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = CourseOffering
        fields = [
            "id",
            "public_id",
            "course",
            "course_detail",
            "term",
            "section",
            "capacity",
            "ta_can_grade",
            "ta_can_notify",
            "status",
            "instructors",
            "enrolled_count",
        ]


class MembershipSerializer(serializers.ModelSerializer):
    user = PersonSerializer(read_only=True)
    program_name = serializers.CharField(source="program.name_ar", read_only=True, default=None)

    class Meta:
        model = DepartmentMembership
        fields = ["id", "department", "program", "program_name", "user", "kind", "created_at"]
        read_only_fields = ["department", "program", "created_at"]


class LeaderSerializer(serializers.Serializer):
    """A department's head or supervisor: the role assignment (revoked by its id) and the
    person (review 2026-11-12, the department's own page)."""

    id = serializers.IntegerField()
    role = serializers.CharField()
    role_label = serializers.CharField(source="get_role_display")
    user = PersonSerializer()


class MembershipAddSerializer(serializers.Serializer):
    user = serializers.SlugRelatedField(slug_field="public_id", queryset=User.objects.all())
    kind = serializers.ChoiceField(choices=DepartmentMembership.Kind.choices)
    # The programme of this department the person joins (owner, 2026-11-13: staff are linked
    # to programmes). Left out, a department with one programme means that one.
    program = serializers.PrimaryKeyRelatedField(
        queryset=Program.objects.all(), required=False, allow_null=True
    )


class StudentSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentRecord
        fields = ["public_id", "university_number", "full_name_ar", "full_name_en", "level"]


class EnrollmentSerializer(serializers.ModelSerializer):
    student = StudentSummarySerializer(source="student_record", read_only=True)
    offering_detail = OfferingSerializer(source="offering", read_only=True)

    class Meta:
        model = Enrollment
        fields = ["id", "offering", "offering_detail", "student", "status", "source", "created_at"]
        read_only_fields = ["status", "source", "created_at"]


class EnrollmentCreateSerializer(serializers.Serializer):
    offering = serializers.PrimaryKeyRelatedField(queryset=CourseOffering.objects.all())
    student_record = serializers.SlugRelatedField(
        slug_field="public_id", queryset=StudentRecord.objects.all()
    )


class BulkEnrollSerializer(serializers.Serializer):
    term = serializers.PrimaryKeyRelatedField(queryset=Term.objects.all())
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.all())
    level = serializers.IntegerField(min_value=1, max_value=10)


class BulkEnrollResultSerializer(serializers.Serializer):
    offerings = serializers.IntegerField()
    students = serializers.IntegerField()
    created = serializers.IntegerField()
    already_enrolled = serializers.IntegerField()


class MyCourseSerializer(serializers.Serializer):
    """One course on the student's or teacher's list for the current term."""

    offering_id = serializers.IntegerField(source="pk")
    public_id = serializers.UUIDField()
    code = serializers.CharField(source="course.code")
    name_ar = serializers.CharField(source="course.name_ar")
    name_en = serializers.CharField(source="course.name_en")
    credit_hours = serializers.IntegerField(source="course.credit_hours")
    section = serializers.CharField()
    term = serializers.CharField(source="term.name_ar")
    my_role = serializers.CharField()
    # What a TA may do in this offering (docs/03 §3.9); ignored for other roles.
    ta_can_grade = serializers.BooleanField()
    ta_can_notify = serializers.BooleanField()
    instructors = InstructorSerializer(many=True)
    # Active enrolments, for the course card (owner, 2026-10-30: more detail on «موادي»).
    students_count = serializers.IntegerField(default=0)
