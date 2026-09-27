from rest_framework import serializers

from academic.models import CourseOffering
from exams.models import ExamAttempt
from files.models import StoredFile
from files.serializers import StoredFileSerializer
from students.models import StudentRecord

from .models import MisconductReport, Regulation, StudentCase, StudentCaseEvent


class RegulationSerializer(serializers.ModelSerializer):
    file = serializers.SlugRelatedField(
        slug_field="public_id", queryset=StoredFile.objects.all(), required=False, allow_null=True
    )
    file_detail = StoredFileSerializer(source="file", read_only=True)
    acknowledged = serializers.SerializerMethodField()
    acknowledgements_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = Regulation
        fields = [
            "public_id",
            "title",
            "body",
            "file",
            "file_detail",
            "category",
            "version",
            "effective_from",
            "requires_acknowledgement",
            "status",
            "published_at",
            "acknowledged",
            "acknowledgements_count",
            "created_at",
        ]
        read_only_fields = ["public_id", "status", "published_at", "version", "created_at"]

    def get_acknowledged(self, obj) -> bool | None:
        acked = self.context.get("acknowledged")
        return None if acked is None else obj.pk in acked


class StudentBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentRecord
        fields = ["public_id", "university_number", "full_name_ar", "level", "status"]
        read_only_fields = fields


class CaseEventSerializer(serializers.ModelSerializer):
    by = serializers.CharField(source="by.full_name_ar", read_only=True)

    class Meta:
        model = StudentCaseEvent
        fields = ["kind", "note", "by", "at"]
        read_only_fields = fields


class CaseSerializer(serializers.ModelSerializer):
    student_record = serializers.SlugRelatedField(
        slug_field="public_id", queryset=StudentRecord.objects.all(), write_only=True
    )
    student = StudentBriefSerializer(source="student_record", read_only=True)
    attachments = serializers.ListField(child=serializers.UUIDField(), required=False)
    events = CaseEventSerializer(many=True, read_only=True)

    class Meta:
        model = StudentCase
        fields = [
            "public_id",
            "student_record",
            "student",
            "kind",
            "title",
            "description",
            "attachments",
            "decision",
            "sanction",
            "effective_from",
            "effective_to",
            "status",
            "published_to_student",
            "events",
            "created_at",
        ]
        read_only_fields = [
            "public_id",
            "decision",
            "sanction",
            "effective_from",
            "effective_to",
            "status",
            "published_to_student",
            "created_at",
        ]


class StudentCaseSerializer(serializers.ModelSerializer):
    """What a student sees of their own published case (no internal notes)."""

    class Meta:
        model = StudentCase
        fields = [
            "public_id",
            "kind",
            "title",
            "decision",
            "sanction",
            "effective_from",
            "effective_to",
            "status",
            "attachments",
            "created_at",
        ]
        read_only_fields = fields


class NoteSerializer(serializers.Serializer):
    note = serializers.CharField()


class DecisionSerializer(serializers.Serializer):
    decision = serializers.CharField()
    sanction = serializers.CharField(required=False, allow_blank=True, default="")
    effective_from = serializers.DateField(required=False, allow_null=True)
    effective_to = serializers.DateField(required=False, allow_null=True)


class ReportSerializer(serializers.ModelSerializer):
    offering = serializers.PrimaryKeyRelatedField(queryset=CourseOffering.objects.all())
    student_record = serializers.SlugRelatedField(
        slug_field="public_id", queryset=StudentRecord.objects.all(), write_only=True
    )
    student = StudentBriefSerializer(source="student_record", read_only=True)
    course_code = serializers.CharField(source="offering.course.code", read_only=True)
    reported_by = serializers.CharField(source="reported_by.full_name_ar", read_only=True)
    case = serializers.SlugRelatedField(slug_field="public_id", read_only=True)
    attempt = serializers.SlugRelatedField(
        slug_field="public_id", queryset=ExamAttempt.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = MisconductReport
        fields = [
            "public_id",
            "attempt",
            "offering",
            "course_code",
            "student_record",
            "student",
            "evidence",
            "status",
            "reported_by",
            "case",
            "created_at",
        ]
        read_only_fields = ["public_id", "status", "case", "created_at"]


class ReportDecisionSerializer(serializers.Serializer):
    convert = serializers.BooleanField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


class StudentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[StudentRecord.Status.ACTIVE, StudentRecord.Status.SUSPENDED]
    )
    reason = serializers.CharField()
