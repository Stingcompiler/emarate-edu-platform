from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from audit.services import RequestMeta, record, snapshot
from core.permissions import capability
from core.viewsets import ScopedModelViewSet

from .models import College, Department, Program, SystemSettings
from .serializers import (
    CollegeSerializer,
    DepartmentSerializer,
    ProgramSerializer,
    SystemSettingsSerializer,
)


class _StructureViewSet(ScopedModelViewSet):
    """The academic structure is readable by staff roles and edited by system admins."""

    read_capability = "structure.view"
    write_capability = "structure.manage"
    department_lookup = None  # structure is college-wide reference data

    def department_of(self, obj):
        return None


class CollegeViewSet(_StructureViewSet):
    queryset = College.objects.all()
    serializer_class = CollegeSerializer
    audit_name = "college"
    search_fields = ["name_ar", "name_en", "code"]


class DepartmentViewSet(_StructureViewSet):
    """Department roles (registrar, manager, supervisor) see only their departments;
    college-wide roles see all (owner 2026-09-29: nothing about other departments)."""

    queryset = Department.objects.select_related("college")
    department_lookup = "pk"
    serializer_class = DepartmentSerializer
    audit_name = "department"
    filterset_fields = ["college", "is_active"]
    search_fields = ["name_ar", "name_en", "code"]


class ProgramViewSet(_StructureViewSet):
    """Scoped like departments: a department role sees its departments' programs."""

    queryset = Program.objects.select_related("department")
    department_lookup = "department"
    serializer_class = ProgramSerializer
    audit_name = "program"
    filterset_fields = ["department", "degree", "is_active"]
    search_fields = ["name_ar", "name_en", "code"]


@extend_schema(tags=["system"])
class SystemSettingsView(generics.RetrieveUpdateAPIView):
    """System switches (docs/03 §2). System admin only."""

    serializer_class = SystemSettingsSerializer
    permission_classes = [IsAuthenticated, capability("settings.manage")]
    http_method_names = ["get", "patch"]

    def get_object(self):
        return SystemSettings.load()

    def perform_update(self, serializer):
        old = snapshot(serializer.instance)
        with transaction.atomic():
            obj = serializer.save()
            record(
                RequestMeta.from_request(self.request),
                "settings.update",
                obj,
                old=old,
                new=snapshot(obj),
            )
