"""Website and portal content: pages, announcements, news, events, media (docs/02 §4.13)."""

from django.conf import settings
from django.core.files.storage import storages
from django.db import models

from core.models import PublicIdModel, SingletonModel, TimestampedModel


def _public_storage():
    return storages["public"]


class Status(models.TextChoices):
    DRAFT = "draft", "مسودة"
    PUBLISHED = "published", "منشور"
    ARCHIVED = "archived", "مؤرشف"


class SiteSettings(SingletonModel):
    name_ar = models.CharField(max_length=200, default="كلية الإمارات للعلوم والتقنية")
    name_en = models.CharField(max_length=200, default="Emirates College of Science and Technology")
    tagline = models.CharField(max_length=300, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    whatsapp_e164 = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=300, blank=True)
    social = models.JSONField(default=dict, blank=True)  # {"facebook": url, ...}
    seo = models.JSONField(default=dict, blank=True)  # {"description": "...", "keywords": [...]}

    def __str__(self) -> str:
        return "site settings"


class MediaAsset(PublicIdModel, TimestampedModel):
    """A public image for the website (covers, page images)."""

    file = models.ImageField(
        storage=_public_storage,
        upload_to="media/%Y/%m/",
        width_field="width",
        height_field="height",
    )
    alt_ar = models.CharField(max_length=200, blank=True)
    alt_en = models.CharField(max_length=200, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    size = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.alt_ar or self.file.name


class Page(PublicIdModel, TimestampedModel):
    slug = models.SlugField(max_length=100, unique=True, allow_unicode=True)
    title_ar = models.CharField(max_length=200)
    title_en = models.CharField(max_length=200, blank=True)
    blocks = models.JSONField(default=list, blank=True)
    seo = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    publish_at = models.DateTimeField(null=True, blank=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["slug"]

    def __str__(self) -> str:
        return self.slug


class Announcement(PublicIdModel, TimestampedModel):
    class Scope(models.TextChoices):
        COLLEGE = "college", "الكلية"
        DEPARTMENT = "department", "قسم"
        PROGRAM = "program", "برنامج"
        OFFERING = "offering", "مادة"

    class Audience(models.TextChoices):
        PUBLIC = "public", "الجميع (الموقع العام)"
        ALL_INTERNAL = "all_internal", "كل مستخدمي البوابة"
        STUDENTS = "students", "الطلاب"
        STAFF = "staff", "الأساتذة والموظفون"

    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.COLLEGE)
    scope_id = models.PositiveIntegerField(null=True, blank=True)
    audience = models.CharField(max_length=12, choices=Audience.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(help_text="Sanitized HTML.")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    publish_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    cover = models.ForeignKey(
        MediaAsset, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    event = models.ForeignKey(
        "Event", on_delete=models.SET_NULL, null=True, blank=True, related_name="announcements"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-is_pinned", "-publish_at", "-id"]
        indexes = [models.Index(fields=["status", "audience", "scope"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(scope="college", scope_id__isnull=True)
                | (~models.Q(scope="college") & models.Q(scope_id__isnull=False)),
                name="announcement_scope_id",
            )
        ]

    def __str__(self) -> str:
        return self.title


class News(PublicIdModel, TimestampedModel):
    slug = models.SlugField(max_length=120, unique=True, allow_unicode=True)
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    body = models.TextField(help_text="Sanitized HTML.")
    cover = models.ForeignKey(
        MediaAsset, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    publish_at = models.DateTimeField(null=True, blank=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-publish_at", "-id"]
        verbose_name_plural = "news"

    def __str__(self) -> str:
        return self.title


class Event(PublicIdModel, TimestampedModel):
    class EventStatus(models.TextChoices):
        DRAFT = "draft", "مسودة"
        PUBLISHED = "published", "منشورة"
        CANCELLED = "cancelled", "ملغاة"

    slug = models.SlugField(max_length=120, unique=True, allow_unicode=True)
    title = models.CharField(max_length=200)
    description = models.TextField(help_text="Sanitized HTML.")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    location = models.CharField(max_length=200, blank=True)
    cover = models.ForeignKey(
        MediaAsset, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    registration_url = models.URLField(blank=True)
    status = models.CharField(max_length=10, choices=EventStatus.choices, default=EventStatus.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["starts_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")), name="event_time_order"
            )
        ]

    def __str__(self) -> str:
        return self.title


class Menu(models.Model):
    key = models.SlugField(max_length=40, unique=True)  # header, footer

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.key


class MenuItem(models.Model):
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name="items")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    label_ar = models.CharField(max_length=100)
    label_en = models.CharField(max_length=100, blank=True)
    url = models.CharField(max_length=300)
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["menu", "order", "id"]

    def __str__(self) -> str:
        return self.label_ar


class Redirect(TimestampedModel):
    from_path = models.CharField(max_length=300, unique=True)
    to_path = models.CharField(max_length=300)
    permanent = models.BooleanField(default=True)
    hits = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["from_path"]

    def __str__(self) -> str:
        return f"{self.from_path} → {self.to_path}"
