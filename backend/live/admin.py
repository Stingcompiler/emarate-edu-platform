from django.contrib import admin

from .models import LiveSession


@admin.register(LiveSession)
class LiveSessionAdmin(admin.ModelAdmin):
    list_display = ("title", "scope", "provider", "starts_at", "status", "host")
    list_filter = ("scope", "provider", "status")
    exclude = ("join_url_encrypted",)  # the link stays encrypted; staff open it from the portal
