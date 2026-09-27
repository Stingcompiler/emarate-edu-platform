from django.contrib import admin

from .models import College, Department, Program, SystemSettings


@admin.register(College)
class CollegeAdmin(admin.ModelAdmin):
    list_display = ("code", "name_ar", "is_active")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("code", "name_ar", "college", "is_active")
    list_filter = ("college", "is_active")
    search_fields = ("code", "name_ar", "name_en")


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ("code", "name_ar", "department", "degree", "levels_count", "is_active")
    list_filter = ("department", "degree", "is_active")
    search_fields = ("code", "name_ar", "name_en")


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not SystemSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
