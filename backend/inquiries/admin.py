from django.contrib import admin

from .models import Inquiry


@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = ("reference_no", "type", "department", "status", "assigned_to", "created_at")
    list_filter = ("type", "status", "department")
    search_fields = ("reference_no", "subject", "contact__email", "contact__phone_e164")
    readonly_fields = [f.name for f in Inquiry._meta.fields]
