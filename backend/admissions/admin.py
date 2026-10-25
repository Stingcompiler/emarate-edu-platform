from django.contrib import admin

from .models import AdmissionCycle, Application, ApplicationFormTemplate, ProgramIntake

admin.site.register(AdmissionCycle)
admin.site.register(ProgramIntake)


@admin.register(ApplicationFormTemplate)
class ApplicationFormTemplateAdmin(admin.ModelAdmin):
    """A published template is fixed: changes go through the portal, which makes a new version
    and audits it (review 2026-10-25 R24). Drafts stay editable here."""

    list_display = ("name", "version", "status")

    def has_change_permission(self, request, obj=None):
        published = obj is not None and obj.status == ApplicationFormTemplate.Status.PUBLISHED
        return not published and super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        published = obj is not None and obj.status == ApplicationFormTemplate.Status.PUBLISHED
        return not published and super().has_delete_permission(request, obj)


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

    def has_delete_permission(self, request, obj=None):
        return False
