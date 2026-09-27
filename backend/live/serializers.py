from rest_framework import serializers

from academic.models import CourseOffering
from organization.models import Program

from .models import LiveSession


class LiveSessionSerializer(serializers.ModelSerializer):
    offering = serializers.PrimaryKeyRelatedField(
        queryset=CourseOffering.objects.all(), required=False, allow_null=True
    )
    program = serializers.PrimaryKeyRelatedField(
        queryset=Program.objects.all(), required=False, allow_null=True
    )
    join_url = serializers.URLField(write_only=True, required=False)
    host_name = serializers.CharField(source="host.full_name_ar", read_only=True)
    course_code = serializers.CharField(source="offering.course.code", read_only=True, default=None)
    course_name = serializers.CharField(
        source="offering.course.name_ar", read_only=True, default=None
    )
    program_name = serializers.CharField(source="program.name_ar", read_only=True, default=None)

    class Meta:
        model = LiveSession
        fields = [
            "public_id",
            "scope",
            "offering",
            "course_code",
            "course_name",
            "program",
            "program_name",
            "level",
            "title",
            "provider",
            "join_url",
            "starts_at",
            "ends_at",
            "host_name",
            "status",
            "recording_url",
        ]
        read_only_fields = ["public_id", "status", "host_name"]

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", None))
        if self.instance is None:
            if scope == "offering" and not attrs.get("offering"):
                raise serializers.ValidationError({"offering": ["Choose the course."]})
            if scope == "cohort" and not (attrs.get("program") and attrs.get("level")):
                raise serializers.ValidationError({"program": ["Choose the program and level."]})
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": ["Must be after the start."]})
        return attrs


class JoinSerializer(serializers.Serializer):
    url = serializers.URLField()
