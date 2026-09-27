from django.contrib import admin

from .models import Announcement, Event, MediaAsset, News, Page, Redirect

for model in (Page, News, Event, MediaAsset, Redirect):
    admin.site.register(model)


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "scope", "audience", "status", "publish_at", "is_pinned")
    list_filter = ("scope", "audience", "status")
