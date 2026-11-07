from django.utils.translation import gettext as _
from rest_framework import serializers

from .models import College, Department, Program, SystemSettings


class CollegeSerializer(serializers.ModelSerializer):
    class Meta:
        model = College
        fields = ["id", "code", "name_ar", "name_en", "name", "is_active"]
        read_only_fields = ["name"]


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "college", "code", "name_ar", "name_en", "name", "description", "is_active"]
        read_only_fields = ["name"]


class ProgramSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name_ar", read_only=True)

    class Meta:
        model = Program
        fields = [
            "id",
            "department",
            "department_name",
            "code",
            "name_ar",
            "name_en",
            "name",
            "degree",
            "levels_count",
            "duration_terms",
            "total_credit_hours",
            "description_ar",
            "description_en",
            "annual_fee_sdg",
            "annual_fee_usd",
            "outcomes_ar",
            "outcomes_en",
            "careers_ar",
            "careers_en",
            "is_active",
        ]
        read_only_fields = ["name"]
        extra_kwargs = {
            # The database checks these too; without the bounds here a bad value was a 500.
            # Levels 1–5, two semesters each (owner, 2026-11-07): engineering and medicine
            # have 5 levels and 10 semesters. duration_terms follows the levels (validate).
            "levels_count": {"min_value": 1, "max_value": 5},
            "duration_terms": {"required": False, "min_value": 1, "max_value": 10},
            "total_credit_hours": {"min_value": 1, "max_value": 300},
            "annual_fee_sdg": {"min_value": 1},
            "annual_fee_usd": {"min_value": 1},
        }

    def validate(self, attrs):
        # A level is a year of two semesters: the semesters are twice the levels, whatever
        # was sent (owner, 2026-11-07).
        levels = attrs.get("levels_count", getattr(self.instance, "levels_count", None))
        if levels is not None:
            attrs["duration_terms"] = 2 * levels
        return attrs

    def validate_department(self, value):
        """A programme moves to another department only while nothing hangs on it: its
        students, courses and applications are scoped by department (owner 2026-11-02)."""
        program = self.instance
        if program is None or value == program.department:
            return value
        from admissions.models import Application

        if (
            program.students.exists()
            or program.courses.exists()
            or Application.objects.filter(intake__program=program).exists()
        ):
            raise serializers.ValidationError(
                _("A programme with students, courses or applications cannot move department.")
            )
        return value


class SystemSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings
        fields = [
            "student_registration_requires_approval",
            "applications_fallback_to_head_registrar",
            "delegate_decisions_to_registrars",
            "otp_ttl_minutes",
            "otp_max_attempts",
            "max_applications_per_cycle",
            "grading_days_limit",
            "upload_min_percent",
            "planned_lectures_per_week",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
        extra_kwargs = {
            "otp_ttl_minutes": {"min_value": 2, "max_value": 60},
            "otp_max_attempts": {"min_value": 3, "max_value": 10},
            "max_applications_per_cycle": {"min_value": 1, "max_value": 10},
            "grading_days_limit": {"min_value": 1, "max_value": 30},
            "upload_min_percent": {"min_value": 10, "max_value": 100},
            "planned_lectures_per_week": {"min_value": 1, "max_value": 10},
        }
