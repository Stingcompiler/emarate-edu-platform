from django.contrib import admin

from .models import HRNotice, Notification, Outbox, PushSubscription


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "category", "sender", "recipients_count", "created_at")
    list_filter = ("kind", "category", "priority")
    search_fields = ("title", "body")
    readonly_fields = [f.name for f in Notification._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(HRNotice)
class HRNoticeAdmin(admin.ModelAdmin):
    list_display = ("subject", "teacher", "sent_by", "requires_ack", "acknowledged_at")
    readonly_fields = [f.name for f in HRNotice._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(Outbox)
class OutboxAdmin(admin.ModelAdmin):
    list_display = ("to", "subject", "status", "attempts", "next_try_at")
    list_filter = ("status",)


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "user_agent", "last_success_at", "created_at")
