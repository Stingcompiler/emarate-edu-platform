from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from academic.models import AcademicYear
from organization.models import Program

from . import services
from .models import (
    AdmissionCycle,
    Application,
    ApplicationDocument,
    ApplicationFormTemplate,
    ApplicationMessage,
    ApplicationStatusHistory,
    ProgramIntake,
)


class CycleSerializer(serializers.ModelSerializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all())

    class Meta:
        model = AdmissionCycle
        fields = ["id", "academic_year", "name", "opens_at", "closes_at", "is_active"]


class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationFormTemplate
        fields = ["id", "name", "version", "status", "schema", "updated_at"]
        read_only_fields = ["id", "version", "status", "updated_at"]

    def validate_schema(self, value):
        problems = services.check_schema(value)
        if problems:
            raise serializers.ValidationError(problems)
        return value


class IntakeSerializer(serializers.ModelSerializer):
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.all())
    program_name = serializers.CharField(source="program.name_ar", read_only=True)
    department_name = serializers.CharField(source="program.department.name_ar", read_only=True)
    applications_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = ProgramIntake
        fields = [
            "id",
            "cycle",
            "program",
            "program_name",
            "department_name",
            "form_template",
            "is_open",
            "opens_at",
            "closes_at",
            "capacity",
            "requirements_ar",
            "requirements_en",
            "required_documents",
            "applications_count",
        ]


class PublicIntakeSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name_ar")
    program_code = serializers.CharField(source="program.code")
    degree = serializers.CharField(source="program.get_degree_display")
    department_name = serializers.CharField(source="program.department.name_ar")
    cycle_name = serializers.CharField(source="cycle.name")
    closes_at = serializers.SerializerMethodField()
    form = serializers.SerializerMethodField()

    class Meta:
        model = ProgramIntake
        fields = [
            "id",
            "program_name",
            "program_code",
            "degree",
            "department_name",
            "cycle_name",
            "closes_at",
            "capacity",
            "requirements_ar",
            "required_documents",
            "form",
        ]

    def get_closes_at(self, obj) -> str:
        return (obj.closes_at or obj.cycle.closes_at).isoformat()

    def get_form(self, obj) -> dict | None:
        if not self.context.get("with_form"):
            return None
        template = services.template_for(obj)
        return (
            {"id": template.pk, "version": template.version, "schema": template.schema}
            if template
            else None
        )


class ApplicationHistorySerializer(serializers.ModelSerializer):
    changed_by = serializers.CharField(
        source="changed_by.full_name_ar", read_only=True, default=None
    )

    class Meta:
        model = ApplicationStatusHistory
        fields = ["from_status", "to_status", "changed_by", "note", "at"]


class ApplicationMessageSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source="author.full_name_ar", read_only=True, default=None)

    class Meta:
        model = ApplicationMessage
        fields = ["id", "author", "channel", "body", "sent_at"]


class ApplicationDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationDocument
        fields = ["public_id", "doc_type", "name", "size", "mime", "status", "note", "created_at"]


class StaffApplicationSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source="intake.program.name_ar", read_only=True)
    department_name = serializers.CharField(
        source="intake.program.department.name_ar", read_only=True
    )
    cycle_name = serializers.CharField(source="intake.cycle.name", read_only=True)
    assigned_registrar_name = serializers.CharField(
        source="assigned_registrar.full_name_ar", read_only=True, default=None
    )
    # For distributing: the department (to offer its registrars) and who holds it now.
    department_id = serializers.IntegerField(source="intake.program.department_id", read_only=True)
    assigned_registrar_id = serializers.UUIDField(
        source="assigned_registrar.public_id", read_only=True, default=None
    )
    university_number = serializers.CharField(
        source="student_record.university_number", read_only=True, default=None
    )
    allowed_transitions = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    history = ApplicationHistorySerializer(many=True, read_only=True)
    messages = ApplicationMessageSerializer(many=True, read_only=True)

    class Meta:
        model = Application
        fields = [
            "public_id",
            "reference_no",
            "full_name",
            "email",
            "phone_e164",
            "program_name",
            "department_name",
            "department_id",
            "cycle_name",
            "status",
            "answers",
            "assigned_registrar_name",
            "assigned_registrar_id",
            "submitted_at",
            "decided_at",
            "decision_note",
            "university_number",
            "allowed_transitions",
            "labels",
            "documents",
            "history",
            "messages",
            "created_at",
        ]
        read_only_fields = fields

    def _reviewer(self, obj) -> bool:
        user = self.context["request"].user
        return services.can_review(user, obj)

    def get_allowed_transitions(self, obj) -> list[str]:
        return services.allowed_transitions(self.context["request"].user, obj)

    def get_labels(self, obj) -> dict[str, str]:
        """Readable labels for answer keys and document types (the form the applicant filled)."""
        schema = obj.form_template.schema if obj.form_template_id else {}
        labels = {f["key"]: f.get("label", f["key"]) for f in services.schema_fields(schema)}
        for doc in obj.intake.required_documents:
            if doc.get("key"):
                labels.setdefault(doc["key"], doc.get("label", doc["key"]))
        return labels

    @extend_schema_field(ApplicationDocumentSerializer(many=True, allow_null=True))
    def get_documents(self, obj):
        # Department manager/supervisor see counts and names, never the documents (docs/03 §3.6).
        if not self._reviewer(obj):
            return None
        return ApplicationDocumentSerializer(obj.documents.all(), many=True).data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._reviewer(instance):
            for key in ("answers", "email", "phone_e164", "messages"):
                data[key] = None
        return data


class ApplicantApplicationSerializer(serializers.ModelSerializer):
    """The applicant's view: no internal notes, no reviewer names on internal steps."""

    program_name = serializers.CharField(source="intake.program.name_ar", read_only=True)
    intake = serializers.IntegerField(source="intake_id", read_only=True)
    form = serializers.SerializerMethodField()
    required_documents = serializers.JSONField(source="intake.required_documents", read_only=True)
    documents = ApplicationDocumentSerializer(many=True, read_only=True)
    history = serializers.SerializerMethodField()
    messages = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "public_id",
            "reference_no",
            "intake",
            "program_name",
            "full_name",
            "email",
            "phone_e164",
            "answers",
            "status",
            "submitted_at",
            "decision_note",
            "form",
            "required_documents",
            "documents",
            "history",
            "messages",
            "can_edit",
            "created_at",
        ]
        read_only_fields = fields

    def get_form(self, obj) -> dict | None:
        t = obj.form_template
        return {"id": t.pk, "version": t.version, "schema": t.schema} if t else None

    def get_history(self, obj) -> list[dict]:
        return [
            {
                "to_status": h.to_status,
                "note": h.note if h.to_status == "missing_documents" else "",
                "at": h.at,
            }
            for h in obj.history.all()
        ]

    def get_messages(self, obj) -> list[dict]:
        return [
            {
                "id": m.id,
                "from_college": m.author_id is not None,
                "body": m.body,
                "sent_at": m.sent_at,
            }
            for m in obj.messages.exclude(channel=ApplicationMessage.Channel.INTERNAL)
        ]

    def get_can_edit(self, obj) -> bool:
        return obj.status in services.OPEN_FOR_APPLICANT


class ApplicationUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=200, required=False)
    phone_e164 = serializers.CharField(max_length=30, required=False, allow_blank=True)
    answers = serializers.DictField(required=False)


class ApplicationStartSerializer(serializers.Serializer):
    intake = serializers.PrimaryKeyRelatedField(
        queryset=ProgramIntake.objects.select_related("cycle", "program")
    )


class ApplicationDocumentUploadSerializer(serializers.Serializer):
    doc_type = serializers.SlugField(max_length=50)
    file = serializers.FileField()


class ApplicantBodySerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)


class ApplicationStaffMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)
    channel = serializers.ChoiceField(choices=["email", "internal"], default="email")


class ApplicationTransitionSerializer(serializers.Serializer):
    to = serializers.ChoiceField(choices=Application.Status.choices)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class ApplicationAssignSerializer(serializers.Serializer):
    registrar = serializers.SlugRelatedField(
        slug_field="public_id", queryset=get_user_model().objects.all(), allow_null=True
    )


class ApplicationDocumentReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ApplicationDocument.Status.choices)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class DocumentLinkSerializer(serializers.Serializer):
    url = serializers.CharField()
    expires_at = serializers.DateTimeField()


class OTPStartSerializer(serializers.Serializer):
    email = serializers.EmailField()


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(r"^\d{6}$")
    name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class VisitorTokenSerializer(serializers.Serializer):
    token = serializers.CharField()
    expires_at = serializers.DateTimeField()
    name = serializers.CharField()


class StatusOnlySerializer(serializers.Serializer):
    reference_no = serializers.CharField()
    status = serializers.CharField()
    status_label = serializers.CharField()
