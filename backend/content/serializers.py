from django.utils.translation import gettext
from rest_framework import serializers

from .models import (
    Announcement,
    Event,
    MediaAsset,
    Menu,
    MenuItem,
    News,
    Page,
    Redirect,
    SiteSettings,
)
from .sanitize import clean_blocks, clean_html

MAX_IMAGE_MB = 5


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = [
            "public_id",
            "file",
            "url",
            "alt_ar",
            "alt_en",
            "width",
            "height",
            "size",
            "created_at",
        ]
        read_only_fields = ["public_id", "url", "width", "height", "size", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def get_url(self, obj) -> str:
        return obj.file.url

    def validate_file(self, value):
        if value.size > MAX_IMAGE_MB * 1024 * 1024:
            raise serializers.ValidationError(
                gettext("Images are limited to %(MAX_IMAGE_MB)s MB.")
                % {"MAX_IMAGE_MB": MAX_IMAGE_MB}
            )
        if value.name.lower().rsplit(".", 1)[-1] not in {"png", "jpg", "jpeg", "webp", "gif"}:
            raise serializers.ValidationError(gettext("Upload a PNG, JPEG, WebP or GIF image."))
        return value


class CoverField(serializers.SlugRelatedField):
    def __init__(self, **kwargs):
        super().__init__(
            slug_field="public_id",
            queryset=MediaAsset.objects.all(),
            required=False,
            allow_null=True,
            **kwargs,
        )


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = [
            "public_id",
            "slug",
            "title_ar",
            "title_en",
            "blocks",
            "seo",
            "status",
            "publish_at",
            "updated_at",
        ]
        read_only_fields = ["public_id", "updated_at"]

    def validate_blocks(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError(gettext("Blocks are a list."))
        return clean_blocks(value)


class AnnouncementSerializer(serializers.ModelSerializer):
    cover = CoverField()
    cover_url = serializers.SerializerMethodField()
    author = serializers.CharField(source="created_by.full_name_ar", read_only=True)

    class Meta:
        model = Announcement
        fields = [
            "public_id",
            "scope",
            "scope_id",
            "audience",
            "title",
            "body",
            "status",
            "publish_at",
            "expires_at",
            "is_featured",
            "is_pinned",
            "cover",
            "cover_url",
            "author",
            "created_at",
        ]
        read_only_fields = ["public_id", "status", "author", "created_at"]

    def get_cover_url(self, obj) -> str | None:
        return obj.cover.file.url if obj.cover_id else None

    def validate_body(self, value):
        return clean_html(value)

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", "college"))
        scope_id = attrs.get("scope_id", getattr(self.instance, "scope_id", None))
        if scope == "college" and scope_id is not None:
            raise serializers.ValidationError(
                {"scope_id": [gettext("College announcements have no scope id.")]}
            )
        if scope != "college" and scope_id is None:
            raise serializers.ValidationError(
                {"scope_id": [gettext("Choose the department, program or course.")]}
            )
        if attrs.get("audience") == "public" and scope != "college":
            raise serializers.ValidationError(
                {"audience": [gettext("Public announcements are college-wide.")]}
            )
        return attrs


class NewsSerializer(serializers.ModelSerializer):
    cover = CoverField()
    cover_url = serializers.SerializerMethodField()

    class Meta:
        model = News
        fields = [
            "public_id",
            "slug",
            "title",
            "summary",
            "body",
            "cover",
            "cover_url",
            "status",
            "publish_at",
            "updated_at",
        ]
        read_only_fields = ["public_id", "updated_at"]

    def get_cover_url(self, obj) -> str | None:
        return obj.cover.file.url if obj.cover_id else None

    def validate_body(self, value):
        return clean_html(value)


class EventSerializer(serializers.ModelSerializer):
    cover = CoverField()
    cover_url = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "public_id",
            "slug",
            "title",
            "description",
            "starts_at",
            "ends_at",
            "location",
            "cover",
            "cover_url",
            "registration_url",
            "status",
            "updated_at",
        ]
        read_only_fields = ["public_id", "updated_at"]

    def get_cover_url(self, obj) -> str | None:
        return obj.cover.file.url if obj.cover_id else None

    def validate_description(self, value):
        return clean_html(value)

    def validate(self, attrs):
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": [gettext("Must be after the start.")]})
        return attrs


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ["id", "parent", "label_ar", "label_en", "url", "order"]

    def validate_url(self, value):
        if not value.startswith(("/", "https://")):
            raise serializers.ValidationError(
                gettext("Use a site path (/...) or an https:// link.")
            )
        return value


class MenuSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True)

    class Meta:
        model = Menu
        fields = ["key", "items"]


class RedirectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Redirect
        fields = ["id", "from_path", "to_path", "permanent", "hits"]
        read_only_fields = ["id", "hits"]

    def validate_from_path(self, value):
        if not value.startswith("/"):
            raise serializers.ValidationError(gettext("Start with /."))
        return value


class SiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = [
            "name_ar",
            "name_en",
            "tagline",
            "email",
            "phone",
            "whatsapp_e164",
            "address",
            "social",
            "seo",
        ]
