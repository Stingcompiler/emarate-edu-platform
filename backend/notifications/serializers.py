from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Category, Channel, HRNotice, Notification, NotificationRecipient


class InboxItemSerializer(serializers.ModelSerializer):
    notification = serializers.UUIDField(source="notification.public_id", read_only=True)
    title = serializers.CharField(source="notification.title", read_only=True)
    body = serializers.CharField(source="notification.body", read_only=True)
    category = serializers.CharField(source="notification.category", read_only=True)
    priority = serializers.CharField(source="notification.priority", read_only=True)
    kind = serializers.CharField(source="notification.kind", read_only=True)
    action_url = serializers.CharField(source="notification.action_url", read_only=True)
    sender = serializers.CharField(
        source="notification.sender.full_name_ar", read_only=True, default=None
    )
    created_at = serializers.DateTimeField(source="notification.created_at", read_only=True)

    class Meta:
        model = NotificationRecipient
        fields = [
            "id",
            "notification",
            "title",
            "body",
            "category",
            "priority",
            "kind",
            "action_url",
            "sender",
            "created_at",
            "read_at",
        ]
        read_only_fields = fields


class UnreadCountSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    by_category = serializers.DictField(child=serializers.IntegerField())


class SendSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160)
    body = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    category = serializers.ChoiceField(
        choices=[Category.COURSE, Category.COLLEGE, Category.RESULTS]
    )
    priority = serializers.ChoiceField(
        choices=Notification.Priority.choices, default=Notification.Priority.NORMAL
    )
    action_url = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    audience = serializers.JSONField()
    channels = serializers.ListField(
        child=serializers.ChoiceField(choices=Channel.choices), required=False
    )

    def validate_action_url(self, value):
        # Only links inside the portal or to https sites.
        if (
            value
            and not (value.startswith("/") and not value.startswith("//"))
            and not value.startswith("https://")
        ):
            raise serializers.ValidationError("Use a portal path (/...) or an https:// link.")
        return value


class AudienceSerializer(serializers.Serializer):
    audience = serializers.JSONField()


class AudienceCountSerializer(serializers.Serializer):
    count = serializers.IntegerField()


class AudienceOptionSerializer(serializers.Serializer):
    label = serializers.CharField()
    audience = serializers.JSONField()
    count = serializers.IntegerField()


class SentNotificationSerializer(serializers.ModelSerializer):
    read_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Notification
        fields = [
            "public_id",
            "title",
            "body",
            "category",
            "priority",
            "action_url",
            "audience",
            "channels",
            "recipients_count",
            "read_count",
            "created_at",
        ]
        read_only_fields = fields


class PreferenceSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=Category.choices)
    inapp = serializers.BooleanField()
    push = serializers.BooleanField()
    email = serializers.BooleanField()


class PushConfigSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    public_key = serializers.CharField(allow_null=True)


class PushKeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField(max_length=200)
    auth = serializers.CharField(max_length=100)


class PushSubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)
    keys = PushKeysSerializer()

    def validate_endpoint(self, value):
        if not value.startswith("https://"):
            raise serializers.ValidationError("Push endpoints are https URLs.")
        return value


class PushUnsubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)


class HRNoticeSerializer(serializers.ModelSerializer):
    teacher = serializers.SlugRelatedField(
        slug_field="public_id", queryset=get_user_model().objects.all()
    )
    teacher_name = serializers.CharField(source="teacher.full_name_ar", read_only=True)
    sent_by = serializers.CharField(source="sent_by.full_name_ar", read_only=True)

    class Meta:
        model = HRNotice
        fields = [
            "public_id",
            "teacher",
            "teacher_name",
            "sent_by",
            "subject",
            "body",
            "requires_ack",
            "acknowledged_at",
            "created_at",
        ]
        read_only_fields = ["public_id", "teacher_name", "sent_by", "acknowledged_at", "created_at"]
