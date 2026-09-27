from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only: the audit log is never edited or deleted."""

    list_display = ("at", "actor", "action", "target_repr", "department", "ip")
    list_filter = ("action", "department")
    search_fields = ("target_repr", "action")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
