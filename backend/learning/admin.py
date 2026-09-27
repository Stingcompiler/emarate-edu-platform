from django.contrib import admin

from .models import Assignment, Lecture, LectureResource, Submission, SubmissionGrade


class ResourceInline(admin.TabularInline):
    model = LectureResource
    extra = 0
    raw_id_fields = ("file", "video")


@admin.register(Lecture)
class LectureAdmin(admin.ModelAdmin):
    list_display = ("title_ar", "offering", "order", "type", "is_published")
    list_filter = ("is_published", "type", "offering__term")
    search_fields = ("title_ar", "title_en", "offering__course__code")
    inlines = [ResourceInline]


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("title", "offering", "due_at", "status", "grading_mode")
    list_filter = ("status", "grading_mode", "late_policy")
    search_fields = ("title", "offering__course__code")


class GradeInline(admin.StackedInline):
    model = SubmissionGrade
    extra = 0
    readonly_fields = ("score", "source", "status", "graded_by", "graded_at")
    can_delete = False


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    """Read-only: grades change through the API, where every change is audited."""

    list_display = ("assignment", "student_record", "first_submitted_at", "is_late")
    list_filter = ("is_late",)
    search_fields = ("student_record__university_number", "assignment__title")
    inlines = [GradeInline]

    def has_change_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        return False
