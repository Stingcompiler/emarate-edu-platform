from django.db.models import Q
from rest_framework import serializers, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from accounts import rbac
from accounts.rbac import Role

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


def _starts(*prefixes: str) -> Q:
    q = Q(pk__in=[])
    for prefix in prefixes:
        q |= Q(action__startswith=prefix)
    return q


# What each role's own field of work writes to the log (docs/03 §3; §7 «سجل التدقيق» ◐).
# A role sees these actions; a department role (the registrar) only in its departments.
DOMAINS = {
    Role.HEAD_REGISTRAR: _starts("admissions.", "inquiry.", "students.", "registration."),
    Role.REGISTRAR: _starts("admissions.", "inquiry."),
    Role.RESULTS_OFFICER: _starts("results."),
    Role.ACADEMIC_AFFAIRS: _starts(
        "course.", "offering.", "membership.", "hr_notice.", "results.correction_"
    ),
    # The site: its own content, and the college-wide announcements and general inquiries.
    Role.SITE_MANAGER: _starts("page.", "news.", "event.", "media.", "menu.", "redirect.", "site.")
    | (_starts("announcement.", "inquiry.") & Q(department__isnull=True)),
}


def visible_logs(user) -> Q:
    """Everything (system admin), one's departments (manager, supervisor), and the log of one's
    own field of work (the roles in DOMAINS), OR-ed."""
    full = rbac.scope_for(user, "audit.view")
    if full.everything:
        return Q()
    allowed = Q(department__in=full.departments) if full.departments else Q(pk__in=[])
    roles = rbac.roles_of(user)
    for role, actions in DOMAINS.items():
        if role not in roles:
            continue
        if role == Role.REGISTRAR:
            departments = user.role_assignments.filter(role=Role.REGISTRAR).values("department_id")
            actions = actions & Q(department__in=departments)
        allowed |= actions
    return allowed


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only. System admin sees everything; department roles their department; the roles
    with a field of work its log (DOMAINS)."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["action", "target_type", "department"]
    search_fields = ["target_repr", "action"]

    def get_queryset(self):
        user = self.request.user
        if getattr(self, "swagger_fake_view", False):
            return AuditLog.objects.none()
        if not (rbac.can(user, "audit.view") or rbac.can(user, "audit.domain")):
            raise PermissionDenied()
        return AuditLog.objects.select_related("actor").filter(visible_logs(user))
