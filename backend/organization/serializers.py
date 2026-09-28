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
    department_name = serializers.CharField(source="department.name", read_only=True)

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
            "is_active",
        ]
        read_only_fields = ["name"]


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
