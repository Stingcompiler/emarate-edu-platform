from rest_framework import serializers

from .models import StudentImportBatch, StudentImportRow, StudentRecord


class StudentRecordSerializer(serializers.ModelSerializer):
    program_code = serializers.CharField(source="program.code", read_only=True)
    program_name = serializers.CharField(source="program.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
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
