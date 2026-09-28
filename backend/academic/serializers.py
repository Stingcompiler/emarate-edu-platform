from django.contrib.auth import get_user_model
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


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "name", "starts_on", "ends_on", "is_current"]


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
        read_only_fields = ["name"]


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

    def validate(self, attrs):
        department = attrs.get("department", getattr(self.instance, "department", None))
        program = attrs.get("program", getattr(self.instance, "program", None))
        level = attrs.get("default_level", getattr(self.instance, "default_level", 1))
        if program is not None:
            if program.department_id != department.pk:
                raise serializers.ValidationError(
                    {"program": ["The program belongs to another department."]}
                )
            if level > program.levels_count:
                raise serializers.ValidationError(
                    {"default_level": [f"This program has {program.levels_count} levels."]}
                )
        return attrs


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["public_id", "full_name_ar", "full_name_en", "email"]


class InstructorSerializer(serializers.ModelSerializer):
    user = PersonSerializer(read_only=True)

    class Meta:
        model = OfferingInstructor
        fields = ["id", "user", "role"]


class InstructorAddSerializer(serializers.Serializer):
    user = serializers.SlugRelatedField(slug_field="public_id", queryset=User.objects.all())
    role = serializers.ChoiceField(choices=OfferingInstructor.Kind.choices)


class CourseSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "code", "name_ar", "name_en", "name", "credit_hours", "default_level"]


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

    class Meta:
        model = DepartmentMembership
        fields = ["id", "department", "user", "kind", "created_at"]
        read_only_fields = ["department", "created_at"]


class MembershipAddSerializer(serializers.Serializer):
    user = serializers.SlugRelatedField(slug_field="public_id", queryset=User.objects.all())
    kind = serializers.ChoiceField(choices=DepartmentMembership.Kind.choices)


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
