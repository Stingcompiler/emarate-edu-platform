from django.utils.translation import gettext
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
    can_join = serializers.SerializerMethodField()

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
            "can_join",
        ]
        read_only_fields = ["public_id", "status", "host_name"]

    def get_can_join(self, obj) -> bool:
        """Whether the link is theirs to open (an observer sees the session without it).

        services.may_join per row cost about five queries a session on the student's «اليوم»
        (review 2026-11): a list works out the same answer from what the user attends and
        teaches, read once, and asks can_manage once per course or programme."""
        from academic.models import OfferingInstructor

        from .models import LiveSession
        from .services import _attending_q, can_manage

        request = self.context.get("request")
        if request is None:
            return False
        user = request.user
        memo = self.__dict__.setdefault("_join_memo", {})
        if not memo:
            memo["attending"] = set(
                LiveSession.objects.filter(_attending_q(user)).values_list("pk", flat=True)
            )
            memo["teaching"] = set(
                OfferingInstructor.objects.filter(user=user).values_list("offering_id", flat=True)
            )
            memo["manage"] = {}
        if obj.pk in memo["attending"] or (obj.offering_id and obj.offering_id in memo["teaching"]):
            return True
        key = ("offering", obj.offering_id) if obj.offering_id else ("program", obj.program_id)
        if key not in memo["manage"]:
            memo["manage"][key] = can_manage(user, obj)
        return memo["manage"][key]

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", None))
        if self.instance is None:
            if scope == "offering" and not attrs.get("offering"):
                raise serializers.ValidationError({"offering": [gettext("Choose the course.")]})
            if scope == "cohort" and not (attrs.get("program") and attrs.get("level")):
                raise serializers.ValidationError(
                    {"program": [gettext("Choose the program and level.")]}
                )
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": [gettext("Must be after the start.")]})
        return attrs


class JoinSerializer(serializers.Serializer):
    url = serializers.URLField()
