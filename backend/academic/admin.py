from django.contrib import admin

from .models import (
    AcademicYear,
    Course,
    CourseOffering,
    DepartmentMembership,
    Enrollment,
    OfferingInstructor,
    Term,
)


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ("name", "starts_on", "ends_on", "is_current")


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ("name_ar", "academic_year", "order", "status", "is_current")
    list_filter = ("academic_year", "status")


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("code", "name_ar", "department", "program", "default_level", "credit_hours")
    list_filter = ("department", "default_level")
    search_fields = ("code", "name_ar", "name_en")


class InstructorInline(admin.TabularInline):
    model = OfferingInstructor
    extra = 0
    autocomplete_fields = ("user",)


@admin.register(CourseOffering)
class CourseOfferingAdmin(admin.ModelAdmin):
    list_display = ("course", "term", "section", "status", "ta_can_grade")
    list_filter = ("term", "status", "course__department")
    search_fields = ("course__code", "course__name_ar")
    inlines = [InstructorInline]


@admin.register(DepartmentMembership)
class DepartmentMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "department", "kind", "created_at")
    list_filter = ("department", "kind")


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("student_record", "offering", "status", "source")
    list_filter = ("status", "source", "offering__term")
    search_fields = ("student_record__university_number", "student_record__full_name_ar")
