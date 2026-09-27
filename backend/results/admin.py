from django.contrib import admin

from .models import AcademicResult, GradingScale, ResultCorrection, ResultImportBatch


@admin.register(ResultImportBatch)
class ResultImportBatchAdmin(admin.ModelAdmin):
    list_display = ("file_name", "term", "department", "status", "uploaded_by", "created_at")
    list_filter = ("status", "term", "department")
    readonly_fields = [f.name for f in ResultImportBatch._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(AcademicResult)
class AcademicResultAdmin(admin.ModelAdmin):
    """Read-only: results change only through approved corrections (audited)."""

    list_display = ("student_record", "offering", "score", "letter", "status", "is_published")
    list_filter = ("term", "status", "is_published")
    search_fields = ("student_record__university_number", "offering__course__code")

    def has_change_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        return False


@admin.register(ResultCorrection)
class ResultCorrectionAdmin(admin.ModelAdmin):
    list_display = ("result", "status", "requested_by", "decided_by", "created_at")
    list_filter = ("status",)
    readonly_fields = [f.name for f in ResultCorrection._meta.fields]


admin.site.register(GradingScale)
