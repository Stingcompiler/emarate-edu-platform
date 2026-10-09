from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema_field
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
from .official import BY_SLUG, public_path
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
            "image_layout",
            "seo",
            "status",
            "publish_at",
            "updated_at",
            "path",
            "official",
        ]
        read_only_fields = ["public_id", "updated_at"]

    path = serializers.SerializerMethodField()
    # One of the college's official pages (content/official.py): its slug is fixed.
    official = serializers.SerializerMethodField()

    def get_path(self, page) -> str:
        return public_path(page.slug)

    def get_official(self, page) -> bool:
        return page.slug in BY_SLUG

    def validate_slug(self, value):
        if self.instance and self.instance.slug in BY_SLUG and value != self.instance.slug:
            raise serializers.ValidationError(gettext("An official page keeps its address."))
        return value

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
        # Public news is the college's, or a department's on its own page (owner 2026-09-30).
        if attrs.get("audience") == "public" and scope not in ("college", "department"):
            raise serializers.ValidationError(
                {"audience": [gettext("Public announcements are for the college or a department.")]}
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


def _menu_url(value: str) -> str:
    # "//host" is protocol-relative, i.e. off-site: only real site paths or https links.
    if value and (value.startswith("//") or not value.startswith(("/", "https://"))):
        raise serializers.ValidationError(gettext("Use a site path (/...) or an https:// link."))
    return value


class MenuLinkSerializer(serializers.ModelSerializer):
    """A link inside a group (the menus are two levels: groups and links)."""

    class Meta:
        model = MenuItem
        fields = ["id", "label_ar", "label_en", "url"]
        read_only_fields = ["id"]
        extra_kwargs = {"url": {"allow_blank": False}}

    def validate_url(self, value):
        return _menu_url(value)


class MenuItemSerializer(MenuLinkSerializer):
    """A top-level entry: a link, or a group of links when it has children."""

    children = MenuLinkSerializer(many=True, required=False)

    class Meta(MenuLinkSerializer.Meta):
        fields = [*MenuLinkSerializer.Meta.fields, "order", "children"]
        extra_kwargs = {"url": {"allow_blank": True}}

    def validate(self, attrs):
        if not attrs.get("url") and not attrs.get("children"):
            raise serializers.ValidationError(
                {"url": [gettext("A link needs a URL; a group needs links.")]}
            )
        return attrs


class MenuSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ["key", "items"]

    @extend_schema_field(MenuItemSerializer(many=True))
    def get_items(self, menu):
        items = list(menu.items.all())
        children: dict[int, list[MenuItem]] = {}
        for item in items:
            if item.parent_id:
                children.setdefault(item.parent_id, []).append(item)
        return [
            {
                **MenuItemSerializer(item).data,
                "children": MenuLinkSerializer(children.get(item.pk, []), many=True).data,
            }
            for item in items
            if not item.parent_id
        ]


class RedirectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Redirect
        fields = ["id", "from_path", "to_path", "permanent", "hits"]
        read_only_fields = ["id", "hits"]

    def validate_from_path(self, value):
        if not value.startswith("/"):
            raise serializers.ValidationError(gettext("Start with /."))
        return value


class _MediaRef(serializers.SlugRelatedField):
    def __init__(self, **kwargs):
        super().__init__(
            slug_field="public_id",
            queryset=MediaAsset.objects.all(),
            allow_null=True,
            required=False,
            **kwargs,
        )


class SiteSettingsSerializer(serializers.ModelSerializer):
    hero_image = _MediaRef()
    logo = _MediaRef()
    share_image = _MediaRef()
    hero_image_url = serializers.SerializerMethodField()
    hero_image_alt_ar = serializers.CharField(
        source="hero_image.alt_ar", read_only=True, default=""
    )
    share_image_url = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()

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
            "founded_year",
            "licence_ar",
            "licence_en",
            "licence_url",
            "figures",
            "office_hours_ar",
            "office_hours_en",
            "map_url",
            "hero_image",
            "hero_image_url",
            "hero_image_alt_ar",
            "share_image",
            "share_image_url",
            "logo",
            "logo_url",
        ]

    def _url(self, asset) -> str | None:
        if asset is None or not asset.file:
            return None
        request = self.context.get("request")
        url = asset.file.url
        return request.build_absolute_uri(url) if request else url

    def get_hero_image_url(self, obj) -> str | None:
        return self._url(obj.hero_image)

    def get_share_image_url(self, obj) -> str | None:
        return self._url(obj.share_image)

    def get_logo_url(self, obj) -> str | None:
        return self._url(obj.logo)

    def validate_founded_year(self, value):
        if value is not None and not 1800 <= value <= 2100:
            raise serializers.ValidationError(gettext("Enter a year between 1800 and 2100."))
        return value

    def validate_licence_url(self, value):
        value = value.strip()
        if value and not (
            value.startswith("https://") or (value.startswith("/") and not value.startswith("//"))
        ):
            raise serializers.ValidationError(
                gettext("Use a portal path (/...) or an https:// link.")
            )
        return value

    def validate_figures(self, value):
        """At most six {value, label_ar, label_en}; blank rows are dropped."""
        if not isinstance(value, list):
            raise serializers.ValidationError(gettext("A list of figures."))
        clean = []
        for row in value:
            if not isinstance(row, dict):
                raise serializers.ValidationError(gettext("A list of figures."))
            item = {k: str(row.get(k, "")).strip()[:60] for k in ("value", "label_ar", "label_en")}
            item["value"] = item["value"][:20]
            if item["value"] and item["label_ar"]:
                clean.append(item)
        if len(clean) > 6:
            raise serializers.ValidationError(gettext("At most six figures."))
        return clean
