from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import RegistrationRequest, RoleAssignment, User


class RoleAssignmentInline(admin.TabularInline):
    model = RoleAssignment
    fk_name = "user"
    extra = 0
    fields = ("role", "department", "created_by", "created_at")
    readonly_fields = ("created_by", "created_at")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "full_name_ar", "is_active", "is_staff", "last_login")
    search_fields = ("email", "full_name_ar", "full_name_en")
    readonly_fields = ("public_id", "last_login", "date_joined", "last_seen")
    inlines = [RoleAssignmentInline]
    fieldsets = (
        (None, {"fields": ("public_id", "email", "password")}),
        ("Profile", {"fields": ("full_name_ar", "full_name_en", "phone_e164")}),
        (
            "Access",
            {"fields": ("is_active", "is_staff", "is_superuser", "must_change_password")},
        ),
        ("Dates", {"fields": ("last_login", "last_seen", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "full_name_ar", "password1", "password2"),
            },
        ),
    )


@admin.register(RegistrationRequest)
class RegistrationRequestAdmin(admin.ModelAdmin):
    list_display = ("email", "student_record", "status", "created_at", "decided_by")
    list_filter = ("status",)
    readonly_fields = [f.name for f in RegistrationRequest._meta.fields]

    def has_add_permission(self, request):
        return False
