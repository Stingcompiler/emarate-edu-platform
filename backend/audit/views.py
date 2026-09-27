from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from accounts import rbac
from core.permissions import capability

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor = serializers.CharField(source="actor.full_name_ar", default=None, read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "at",
            "actor",
            "action",
            "target_type",
            "target_id",
            "target_repr",
            "old",
            "new",
            "department",
            "ip",
        ]
        read_only_fields = fields


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only. System admin sees everything; department roles their department."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, capability("audit.view")]
    filterset_fields = ["action", "target_type", "department"]
    search_fields = ["target_repr", "action"]

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor")
        return rbac.scope_for(self.request.user, "audit.view").filter(queryset, "department")
