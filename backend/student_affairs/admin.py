from django.contrib import admin

from .models import MisconductReport, Regulation, StudentCase


@admin.register(Regulation)
class RegulationAdmin(admin.ModelAdmin):
    list_display = ("title", "version", "category", "status", "published_at")
    list_filter = ("status", "category")


@admin.register(StudentCase)
class StudentCaseAdmin(admin.ModelAdmin):
    list_display = ("title", "student_record", "kind", "status", "published_to_student")
    list_filter = ("kind", "status")
    search_fields = ("title", "student_record__university_number")


@admin.register(MisconductReport)
class MisconductReportAdmin(admin.ModelAdmin):
    list_display = ("student_record", "offering", "status", "reported_by", "created_at")
    list_filter = ("status",)
