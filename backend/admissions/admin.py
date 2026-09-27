from django.contrib import admin

from .models import AdmissionCycle, Application, ApplicationFormTemplate, ProgramIntake

admin.site.register(AdmissionCycle)
admin.site.register(ProgramIntake)
admin.site.register(ApplicationFormTemplate)


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    """Read-only: applications move only through the state machine (audited)."""

    list_display = (
        "reference_no",
        "full_name",
        "intake",
        "status",
        "assigned_registrar",
        "submitted_at",
    )
    list_filter = ("status", "intake__cycle")
    search_fields = ("reference_no", "full_name", "email", "phone_e164")

    def has_change_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        return False
