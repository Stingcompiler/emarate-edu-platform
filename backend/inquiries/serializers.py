from django.contrib.auth import get_user_model
from rest_framework import serializers

from organization.models import Department

from .models import Inquiry, InquiryMessage, InquiryStatusHistory


class PublicInquirySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    type = serializers.ChoiceField(choices=Inquiry.Type.choices)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        default=None,
    )
    subject = serializers.CharField(max_length=200)
    message = serializers.CharField(max_length=4000)
    website = serializers.CharField(
        required=False, allow_blank=True, default="", help_text="Leave empty (bot trap)."
    )


class PublicReceiptSerializer(serializers.Serializer):
    reference_no = serializers.CharField()
    status = serializers.CharField()
    status_label = serializers.CharField()


class MessageSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source="author.full_name_ar", read_only=True, default=None)

    class Meta:
        model = InquiryMessage
        fields = ["id", "author", "channel", "body", "sent_at"]
        read_only_fields = fields


class HistorySerializer(serializers.ModelSerializer):
    by = serializers.CharField(source="by.full_name_ar", read_only=True, default=None)

    class Meta:
        model = InquiryStatusHistory
        fields = ["from_status", "to_status", "by", "note", "at"]
        read_only_fields = fields


class InquirySerializer(serializers.ModelSerializer):
    contact = serializers.SerializerMethodField()
    department_name = serializers.CharField(
        source="department.name_ar", read_only=True, default=None
    )
    assigned_to_name = serializers.CharField(
        source="assigned_to.full_name_ar", read_only=True, default=None
    )
    messages = MessageSerializer(many=True, read_only=True)
    history = HistorySerializer(many=True, read_only=True)

    class Meta:
        model = Inquiry
        fields = [
            "public_id",
            "reference_no",
            "contact",
            "type",
            "department",
            "department_name",
            "subject",
            "message",
            "status",
            "assigned_to_name",
            "source",
            "first_response_at",
            "resolved_at",
            "created_at",
            "messages",
            "history",
        ]
        read_only_fields = fields

    def get_contact(self, obj) -> dict:
        c = obj.contact
        return {"name": c.name, "email": c.email, "phone_e164": c.phone_e164}


class ReplySerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)
    channel = serializers.ChoiceField(choices=["email", "internal"], default="email")


class WhatsAppSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2000)


class WhatsAppLinkSerializer(serializers.Serializer):
    url = serializers.URLField()


class TransitionSerializer(serializers.Serializer):
    to = serializers.ChoiceField(choices=Inquiry.Status.choices)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AssignSerializer(serializers.Serializer):
    user = serializers.SlugRelatedField(
        slug_field="public_id", queryset=get_user_model().objects.all(), allow_null=True
    )


class RerouteSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=Inquiry.Type.choices)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), required=False, allow_null=True
    )
