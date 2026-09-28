from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from organization.models import Department

from . import rbac
from .models import RegistrationRequest, RoleAssignment, User
from .rbac import Role


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(help_text="Email or university number.")
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})


class RoleAssignmentSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(
        source="department.name_ar", read_only=True, default=None
    )
    role_label = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = RoleAssignment
        fields = ["id", "role", "role_label", "department", "department_name", "created_at"]


class ScopeSerializer(serializers.Serializer):
    everything = serializers.BooleanField()
    departments = serializers.ListField(child=serializers.IntegerField())


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    capabilities = serializers.SerializerMethodField()
    student = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "public_id",
            "email",
            "full_name_ar",
            "full_name_en",
            "phone_e164",
            "must_change_password",
            "roles",
            "capabilities",
            "student",
        ]

    @extend_schema_field(RoleAssignmentSerializer(many=True))
    def get_roles(self, obj) -> list[dict]:
        rows = obj.role_assignments.select_related("department")
        return RoleAssignmentSerializer(rows, many=True).data

    @extend_schema_field(serializers.DictField(child=ScopeSerializer()))
    def get_capabilities(self, obj) -> dict[str, dict]:
        return {
            name: {"everything": scope.everything, "departments": sorted(scope.departments)}
            for name, scope in rbac.capabilities_of(obj).items()
        }

    def get_student(self, obj) -> dict | None:
        record_ = getattr(obj, "student_record", None)
        if record_ is None:
            return None
        return {
            "public_id": str(record_.public_id),
            "university_number": record_.university_number,
            # The portal is Arabic-first; the API's `name` follows Accept-Language.
            "program": record_.program.name_ar,
            "department": record_.department.name_ar,
            "level": record_.level,
            "status": record_.status,
        }


# ─── Registration (public) ────────────────────────────────────────────────


class RegistrationStartSerializer(serializers.Serializer):
    university_number = serializers.CharField(max_length=30)
    full_name = serializers.CharField(max_length=200)
    email = serializers.EmailField()


class RegistrationStartResponseSerializer(serializers.Serializer):
    request_id = serializers.UUIDField()
    detail = serializers.CharField()


class RegistrationVerifySerializer(serializers.Serializer):
    request_id = serializers.UUIDField()
    code = serializers.RegexField(r"^\d{6}$")


class RegistrationCompleteSerializer(serializers.Serializer):
    request_id = serializers.UUIDField()
    password = serializers.CharField(trim_whitespace=False, min_length=8)


class RegistrationCompleteResponseSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["active", "pending_approval"])


class PasswordForgotSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(r"^\d{6}$")
    new_password = serializers.CharField(trim_whitespace=False, min_length=8)


class ActivateSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, min_length=8)


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()


# ─── Staff: users, roles, registration requests ───────────────────────────


class UserSerializer(serializers.ModelSerializer):
    roles = RoleAssignmentSerializer(source="role_assignments", many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "public_id",
            "email",
            "full_name_ar",
            "full_name_en",
            "phone_e164",
            "is_active",
            "last_login",
            "roles",
        ]
        read_only_fields = fields


class UserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name_ar = serializers.CharField(max_length=200)
    full_name_en = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone_e164 = serializers.CharField(max_length=20, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Role.choices)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), required=False, allow_null=True
    )


class RoleGrantSerializer(serializers.Serializer):
    user = serializers.SlugRelatedField(slug_field="public_id", queryset=User.objects.all())
    role = serializers.ChoiceField(choices=Role.choices)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), required=False, allow_null=True
    )


class RoleAssignmentDetailSerializer(RoleAssignmentSerializer):
    user = serializers.SlugRelatedField(slug_field="public_id", read_only=True)

    class Meta(RoleAssignmentSerializer.Meta):
        fields = [*RoleAssignmentSerializer.Meta.fields, "user"]


class RegistrationRequestSerializer(serializers.ModelSerializer):
    university_number = serializers.CharField(source="student_record.university_number")
    full_name_ar = serializers.CharField(source="student_record.full_name_ar")
    program = serializers.CharField(source="student_record.program.name_ar")
    level = serializers.IntegerField(source="student_record.level")
    official_email = serializers.CharField(source="student_record.email")
    email_matches_record = serializers.SerializerMethodField()

    class Meta:
        model = RegistrationRequest
        fields = [
            "public_id",
            "university_number",
            "full_name_ar",
            "program",
            "level",
            "email",
            "official_email",
            "email_matches_record",
            "status",
            "created_at",
            "decided_at",
            "reason",
        ]
        read_only_fields = fields

    def get_email_matches_record(self, obj) -> bool:
        official = (obj.student_record.email or "").lower()
        return bool(official) and official == obj.email.lower()


class RegistrationDecisionSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, attrs):
        if not attrs["approve"] and not attrs.get("reason"):
            raise serializers.ValidationError({"reason": ["Give a reason when rejecting."]})
        return attrs
