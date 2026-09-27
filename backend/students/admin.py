from django.contrib import admin

from .models import StudentImportBatch, StudentRecord


@admin.register(StudentRecord)
class StudentRecordAdmin(admin.ModelAdmin):
    list_display = ("university_number", "full_name_ar", "program", "level", "status", "user")
    list_filter = ("department", "program", "level", "status")
    search_fields = ("university_number", "full_name_ar", "full_name_en", "email")
    readonly_fields = ("public_id", "department", "national_id_hash")


@admin.register(StudentImportBatch)
class StudentImportBatchAdmin(admin.ModelAdmin):
    list_display = ("file_name", "status", "uploaded_by", "created_at", "committed_at")
    readonly_fields = [f.name for f in StudentImportBatch._meta.fields]

    def has_add_permission(self, request):
        return False
