import phonenumbers
from django.utils.translation import gettext
from rest_framework import serializers

from accounts import rbac
from organization.models import Program

from .models import StudentImportBatch, StudentImportRow, StudentRecord


class StudentRecordSerializer(serializers.ModelSerializer):
    program_code = serializers.CharField(source="program.code", read_only=True)
    program_name = serializers.CharField(source="program.name_ar", read_only=True)
    department_name = serializers.CharField(source="department.name_ar", read_only=True)
    has_account = serializers.SerializerMethodField()

    class Meta:
        model = StudentRecord
        fields = [
            "public_id",
            "university_number",
            "full_name_ar",
            "full_name_en",
            "program",
            "program_code",
            "program_name",
            "department",
            "department_name",
            "level",
            "status",
            "email",
            "phone_e164",
            "gender",
            "birth_date",
            "has_account",
        ]
        read_only_fields = fields

    def get_has_account(self, obj) -> bool:
        return obj.user_id is not None


class StudentRecordWriteSerializer(serializers.ModelSerializer):
    """Add or correct a record by hand (owner 2026-09-29). Blank number = issue the next one."""

    university_number = serializers.CharField(max_length=30, required=False, allow_blank=True)
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.none())

    class Meta:
        model = StudentRecord
        fields = [
            "university_number",
            "full_name_ar",
            "full_name_en",
            "program",
            "level",
            "email",
            "phone_e164",
            "gender",
            "birth_date",
        ]
        extra_kwargs = {
            "full_name_en": {"required": False},
            "email": {"required": False},
            "phone_e164": {"required": False},
            "gender": {"required": False},
            "birth_date": {"required": False},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        user = request.user if request else None
        # Only programs the caller may manage are choices; others read as "does not exist".
        self.fields["program"].queryset = rbac.scope_for(user, "students.manage").filter(
            Program.objects.all(), "department"
        )

    def validate_university_number(self, value: str) -> str:
        return value.strip().upper()

    def validate_full_name_ar(self, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError(gettext("This field is required."))
        return value

    def validate_full_name_en(self, value: str) -> str:
        return " ".join(value.split())

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_phone_e164(self, value: str) -> str:
        value = value.strip()
        if not value:
            return ""
        try:
            parsed = phonenumbers.parse(value, "SD")
            if not phonenumbers.is_valid_number(parsed):
                raise phonenumbers.NumberParseException(0, "invalid")
        except phonenumbers.NumberParseException as error:
            raise serializers.ValidationError(gettext("phone: invalid")) from error
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


class ImportUploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class ImportBatchSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.CharField(source="uploaded_by.full_name_ar", read_only=True)

    class Meta:
        model = StudentImportBatch
        fields = [
            "public_id",
            "file_name",
            "status",
            "summary",
            "uploaded_by",
            "created_at",
            "committed_at",
        ]
        read_only_fields = fields


class ImportRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentImportRow
        fields = ["row_no", "action", "normalized", "changes", "errors"]
        read_only_fields = fields
