from rest_framework import serializers

from academic.models import Term
from organization.models import Department, Program

from .models import (
    AcademicResult,
    GradingScale,
    ResultCorrection,
    ResultDisplaySettings,
    ResultImportBatch,
    ResultImportRow,
    TermResultRelease,
)


class ResultUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    term = serializers.PrimaryKeyRelatedField(queryset=Term.objects.all())
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), required=False, allow_null=True
    )


class ResultBatchSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.CharField(source="uploaded_by.full_name_ar", read_only=True)
    term_name = serializers.CharField(source="term.name_ar", read_only=True)
    department_name = serializers.CharField(
        source="department.name_ar", read_only=True, default=None
    )

    class Meta:
        model = ResultImportBatch
        fields = [
            "public_id",
            "file_name",
            "scope",
            "department",
            "department_name",
            "term",
            "term_name",
            "status",
            "summary",
            "detected_columns",
            "uploaded_by",
            "created_at",
            "committed_at",
            "published_at",
        ]
        read_only_fields = fields


class ResultRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResultImportRow
        fields = ["row_no", "action", "raw", "normalized", "errors"]
        read_only_fields = fields


class ResultSerializer(serializers.ModelSerializer):
    university_number = serializers.CharField(
        source="student_record.university_number", read_only=True
    )
    student_name = serializers.CharField(source="student_record.full_name_ar", read_only=True)
    course_code = serializers.CharField(source="offering.course.code", read_only=True)
    course_name = serializers.CharField(source="offering.course.name_ar", read_only=True)
    credit_hours = serializers.IntegerField(source="offering.course.credit_hours", read_only=True)
    term_name = serializers.CharField(source="term.name_ar", read_only=True)

    class Meta:
        model = AcademicResult
        fields = [
            "id",
            "university_number",
            "student_name",
            "course_code",
            "course_name",
            "credit_hours",
            "term",
            "term_name",
            "score",
            "letter",
            "grade_points",
            "status",
            "is_published",
            "version",
        ]
        read_only_fields = fields


class CorrectionRequestSerializer(serializers.Serializer):
    score = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=0, max_value=100, required=False, allow_null=True
    )
    status = serializers.ChoiceField(
        choices=AcademicResult.Status.choices, required=False, allow_null=True
    )
    reason = serializers.CharField()

    def validate(self, attrs):
        if attrs.get("score") is None and attrs.get("status") is None:
            raise serializers.ValidationError({"score": ["Give a new score or status."]})
        return attrs


class CorrectionSerializer(serializers.ModelSerializer):
    result = ResultSerializer(read_only=True)
    requested_by = serializers.CharField(source="requested_by.full_name_ar", read_only=True)
    decided_by = serializers.CharField(
        source="decided_by.full_name_ar", read_only=True, default=None
    )

    class Meta:
        model = ResultCorrection
        fields = [
            "public_id",
            "result",
            "old",
            "new",
            "reason",
            "status",
            "requested_by",
            "created_at",
            "decided_by",
            "decided_at",
            "decision_note",
        ]
        read_only_fields = fields


class CorrectionDecisionSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    note = serializers.CharField(required=False, allow_blank=True, default="")


class DisplaySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResultDisplaySettings
        fields = [
            "show_score",
            "show_letter",
            "show_points",
            "show_gpa",
            "history_open",
            "notice_text",
        ]


class BandSerializer(serializers.Serializer):
    min = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100)
    letter = serializers.CharField(max_length=4)
    points = serializers.DecimalField(max_digits=4, decimal_places=2, min_value=0, max_value=5)


class GradingScaleSerializer(serializers.ModelSerializer):
    program = serializers.PrimaryKeyRelatedField(
        queryset=Program.objects.all(), required=False, allow_null=True
    )
    ranges = BandSerializer(many=True)

    class Meta:
        model = GradingScale
        fields = ["id", "program", "ranges"]
        read_only_fields = ["id"]

    def validate_ranges(self, value):
        if not any(band["min"] == 0 for band in value):
            raise serializers.ValidationError("Include a band starting at 0.")
        return [
            {"min": str(b["min"]), "letter": b["letter"].upper(), "points": str(b["points"])}
            for b in sorted(value, key=lambda b: -b["min"])
        ]


class TermReleaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TermResultRelease
        fields = ["id", "term", "program", "is_visible"]
        read_only_fields = ["id"]


class MyResultRowSerializer(serializers.Serializer):
    correction_pending = serializers.BooleanField()
    course_code = serializers.CharField()
    course_name = serializers.CharField()
    credit_hours = serializers.IntegerField()
    score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    letter = serializers.CharField(allow_null=True)
    grade_points = serializers.DecimalField(max_digits=4, decimal_places=2, allow_null=True)
    status = serializers.CharField()


class MyTermSerializer(serializers.Serializer):
    term = serializers.IntegerField()
    term_name = serializers.CharField()
    credit_hours = serializers.IntegerField()
    published_at = serializers.DateTimeField(allow_null=True)
    gpa = serializers.DecimalField(max_digits=4, decimal_places=2, allow_null=True)
    results = MyResultRowSerializer(many=True)


class MyResultsSerializer(serializers.Serializer):
    notice = serializers.CharField()
    show = serializers.DictField(child=serializers.BooleanField())
    cumulative_gpa = serializers.DecimalField(max_digits=4, decimal_places=2, allow_null=True)
    terms = MyTermSerializer(many=True)

    @staticmethod
    def build(view: dict) -> dict:
        """Shape services.student_view() for this serializer, applying display settings."""
        display = view["display"]
        show = {
            "score": display.show_score,
            "letter": display.show_letter,
            "points": display.show_points,
            "gpa": display.show_gpa,
        }
        return {
            "notice": display.notice_text,
            "show": show,
            "cumulative_gpa": view["cumulative_gpa"] if show["gpa"] else None,
            "terms": [
                {
                    "term": t["term"].pk,
                    "term_name": t["term"].name_ar,
                    "credit_hours": sum(r.offering.course.credit_hours for r in t["rows"]),
                    "published_at": max(
                        (r.published_at for r in t["rows"] if r.published_at), default=None
                    ),
                    "gpa": t["gpa"] if show["gpa"] else None,
                    "results": [
                        {
                            "correction_pending": r.pk in view["pending"],
                            "course_code": r.offering.course.code,
                            "course_name": r.offering.course.name_ar,
                            "credit_hours": r.offering.course.credit_hours,
                            "score": r.score if show["score"] else None,
                            "letter": r.letter if show["letter"] else None,
                            "grade_points": r.grade_points if show["points"] else None,
                            "status": r.status,
                        }
                        for r in t["rows"]
                    ],
                }
                for t in view["terms"]
            ],
        }
