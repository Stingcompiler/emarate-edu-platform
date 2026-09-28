from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from academic.models import CourseOffering
from files.models import StoredFile, VideoAsset
from files.serializers import StoredFileSerializer, VideoSerializer

from .models import (
    Assignment,
    AssignmentLinkField,
    Lecture,
    LectureResource,
    Submission,
    SubmissionGrade,
    SubmissionVersion,
)

SUBMISSION_TYPES = ["text", "file", "link"]
RULE_TYPES = ["submitted", "on_time", "min_files", "has_link", "min_words"]


class ResourceSerializer(serializers.ModelSerializer):
    file = StoredFileSerializer(read_only=True)
    video = VideoSerializer(read_only=True)

    class Meta:
        model = LectureResource
        fields = ["id", "kind", "title", "order", "url", "file", "video"]
        read_only_fields = fields


class ResourceCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=LectureResource.Kind.choices)
    title = serializers.CharField(max_length=200)
    order = serializers.IntegerField(min_value=1, default=1)
    url = serializers.URLField(required=False, allow_blank=True, default="")
    file = serializers.SlugRelatedField(
        slug_field="public_id", queryset=StoredFile.objects.all(), required=False, allow_null=True
    )
    video = serializers.SlugRelatedField(
        slug_field="public_id", queryset=VideoAsset.objects.all(), required=False, allow_null=True
    )


class LectureSerializer(serializers.ModelSerializer):
    offering = serializers.PrimaryKeyRelatedField(queryset=CourseOffering.objects.all())
    resources = ResourceSerializer(many=True, read_only=True)

    class Meta:
        model = Lecture
        fields = [
            "public_id",
            "offering",
            "title_ar",
            "title_en",
            "description",
            "order",
            "type",
            "is_published",
            "published_at",
            "resources",
            "created_at",
        ]
        read_only_fields = ["public_id", "is_published", "published_at", "resources", "created_at"]


class LinkFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentLinkField
        fields = ["label", "required", "url_pattern"]


class RubricRuleSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=RULE_TYPES)
    points = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)
    count = serializers.IntegerField(min_value=1, required=False)
    label = serializers.CharField(required=False)


class MySubmissionSummarySerializer(serializers.Serializer):
    public_id = serializers.UUIDField()
    submitted_at = serializers.DateTimeField()
    is_late = serializers.BooleanField()
    graded = serializers.BooleanField()
    score = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)


class AssignmentSerializer(serializers.ModelSerializer):
    offering = serializers.PrimaryKeyRelatedField(queryset=CourseOffering.objects.all())
    lecture = serializers.SlugRelatedField(
        slug_field="public_id", queryset=Lecture.objects.all(), required=False, allow_null=True
    )
    submission_types = serializers.ListField(
        child=serializers.ChoiceField(choices=SUBMISSION_TYPES), allow_empty=True, required=False
    )
    allowed_extensions = serializers.ListField(
        child=serializers.CharField(max_length=10), required=False
    )
    link_fields = LinkFieldSerializer(many=True, required=False)
    course_code = serializers.CharField(source="offering.course.code", read_only=True)
    course_name = serializers.CharField(source="offering.course.name_ar", read_only=True)
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "public_id",
            "offering",
            "course_code",
            "course_name",
            "mine",
            "lecture",
            "title",
            "description",
            "type",
            "opens_at",
            "due_at",
            "late_until",
            "late_policy",
            "late_penalty_percent",
            "max_grade",
            "submission_types",
            "allowed_extensions",
            "max_file_size_mb",
            "max_files",
            "allow_resubmission",
            "grading_mode",
            "rubric",
            "link_fields",
            "status",
            "created_at",
        ]
        read_only_fields = ["public_id", "status", "created_at"]

    @extend_schema_field(MySubmissionSummarySerializer(allow_null=True))
    def get_mine(self, obj):
        """The signed-in student's own submission (prefetched by the view); null for staff."""
        mine = getattr(obj, "my_submissions", None)
        if not mine:
            return None
        submission = mine[0]
        grade = getattr(submission, "grade", None)
        approved = grade is not None and grade.status == "approved"
        return {
            "public_id": submission.public_id,
            "submitted_at": submission.first_submitted_at,
            "is_late": submission.is_late,
            "graded": approved,
            "score": grade.final_score if approved else None,
        }

    def validate_rubric(self, value):
        rules = value.get("rules", []) if isinstance(value, dict) else None
        if rules is None:
            raise serializers.ValidationError('Use {"rules": [...]}.')
        checked = RubricRuleSerializer(data=rules, many=True)
        checked.is_valid(raise_exception=True)
        return {"rules": [{**r, "points": str(r["points"])} for r in checked.validated_data]}

    def validate(self, attrs):
        get = lambda name: attrs.get(name, getattr(self.instance, name, None))  # noqa: E731
        due, late_until = get("due_at"), get("late_until")
        if late_until and due and late_until < due:
            raise serializers.ValidationError({"late_until": ["Must be after the due date."]})
        opens = get("opens_at")
        if opens and due and opens >= due:
            raise serializers.ValidationError({"opens_at": ["Must be before the due date."]})
        lecture, offering = get("lecture"), get("offering")
        if lecture and offering and lecture.offering_id != offering.pk:
            raise serializers.ValidationError({"lecture": ["Pick a lecture of the same course."]})
        if "submission_types" in attrs:
            attrs["submission_types"] = sorted(set(attrs["submission_types"]))
        if "allowed_extensions" in attrs:
            attrs["allowed_extensions"] = sorted(
                {e.lower().lstrip(".") for e in attrs["allowed_extensions"]}
            )
        return attrs


class VersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubmissionVersion
        fields = ["version_no", "content", "files", "links", "submitted_at", "is_late"]
        read_only_fields = fields


class GradeSerializer(serializers.ModelSerializer):
    final_score = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = SubmissionGrade
        fields = [
            "score",
            "final_score",
            "feedback",
            "rubric_scores",
            "source",
            "status",
            "graded_at",
        ]
        read_only_fields = fields


class SubmissionStudentSerializer(serializers.Serializer):
    public_id = serializers.UUIDField()
    university_number = serializers.CharField()
    full_name_ar = serializers.CharField()


class SubmissionSerializer(serializers.ModelSerializer):
    """Read-only. Grades are written only through the grade/approve actions."""

    assignment = serializers.SlugRelatedField(slug_field="public_id", read_only=True)
    student = SubmissionStudentSerializer(source="student_record", read_only=True)
    current_version = VersionSerializer(read_only=True)
    versions_count = serializers.SerializerMethodField()
    grade = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            "public_id",
            "assignment",
            "student",
            "first_submitted_at",
            "is_late",
            "current_version",
            "versions_count",
            "grade",
        ]
        read_only_fields = fields

    def get_versions_count(self, obj) -> int:
        return obj.versions.count()

    @extend_schema_field(GradeSerializer(allow_null=True))
    def get_grade(self, obj) -> dict | None:
        found = getattr(obj, "grade", None)
        if found is None:
            return None
        # Students see only approved grades; staff also see suggestions.
        if not self.context.get("staff") and found.status != SubmissionGrade.Status.APPROVED:
            return None
        return GradeSerializer(found).data


class SubmitSerializer(serializers.Serializer):
    content = serializers.CharField(required=False, allow_blank=True, default="")
    files = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    links = serializers.DictField(child=serializers.CharField(), required=False, default=dict)


class GradeInputSerializer(serializers.Serializer):
    score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)
    feedback = serializers.CharField(required=False, allow_blank=True, default="")
    rubric_scores = serializers.DictField(required=False, default=dict)
