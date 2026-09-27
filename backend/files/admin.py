from django.contrib import admin

from .models import StoredFile, VideoAsset


@admin.register(StoredFile)
class StoredFileAdmin(admin.ModelAdmin):
    list_display = ("name", "purpose", "offering", "size", "uploaded_by", "created_at")
    list_filter = ("purpose",)
    search_fields = ("name",)
    readonly_fields = [f.name for f in StoredFile._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(VideoAsset)
class VideoAssetAdmin(admin.ModelAdmin):
    list_display = ("title", "provider", "status", "offering", "size", "created_at")
    list_filter = ("provider", "status")
    search_fields = ("title", "provider_id")
