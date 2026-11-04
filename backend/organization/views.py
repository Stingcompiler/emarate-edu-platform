from datetime import UTC, datetime

from django.conf import settings
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import RequestMeta, record, snapshot
from content.services import request_site_rebuild
from core.permissions import capability
from core.viewsets import ScopedModelViewSet

from . import services
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

    # The public site lists departments and programs: rebuild it after a change instead of
    # waiting for the six-hourly build (admin review 2026-11-02).
    def perform_create(self, serializer):
        super().perform_create(serializer)
        transaction.on_commit(request_site_rebuild)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        transaction.on_commit(request_site_rebuild)

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        transaction.on_commit(request_site_rebuild)


class _CodedViewSet(_StructureViewSet):
    """Departments and programmes: the site's address carries the code."""

    site_section: str

    def perform_update(self, serializer):
        old = serializer.instance.code
        with transaction.atomic():
            super().perform_update(serializer)
            services.redirect_old_code(self.site_section, old, serializer.instance.code)


class CollegeViewSet(_StructureViewSet):
    queryset = College.objects.all()
    serializer_class = CollegeSerializer
    audit_name = "college"
    search_fields = ["name_ar", "name_en", "code"]


class DepartmentViewSet(_CodedViewSet):
    """Department roles (registrar, manager, supervisor) see only their departments;
    college-wide roles see all (owner 2026-09-29: nothing about other departments)."""

    queryset = Department.objects.select_related("college")
    department_lookup = "pk"
    serializer_class = DepartmentSerializer
    audit_name = "department"
    site_section = "departments"
    filterset_fields = ["college", "is_active"]
    search_fields = ["name_ar", "name_en", "code"]


class ProgramViewSet(_CodedViewSet):
    """Scoped like departments: a department role sees its departments' programs."""

    queryset = Program.objects.select_related("department")
    department_lookup = "department"
    serializer_class = ProgramSerializer
    audit_name = "program"
    site_section = "programs"
    filterset_fields = ["department", "degree", "is_active"]
    search_fields = ["name_ar", "name_en", "code"]

    def perform_destroy(self, instance):
        # Intakes nobody applied to go with the programme (it may have been opened for
        # applying by mistake, #223); one with an application keeps it in use (R28).
        with transaction.atomic():
            instance.intakes.filter(applications__isnull=True).delete()
            super().perform_destroy(instance)


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


class SystemStatusSerializer(serializers.Serializer):
    backups = serializers.DictField()
    email = serializers.DictField()
    students = serializers.DictField()


_TEST_MAILERS = ("console", "locmem", "filebased", "dummy", "dev")


@extend_schema(tags=["system"], responses=SystemStatusSerializer)
class SystemStatusView(APIView):
    """The admin home's status tiles (review 2026-09-29 PR 7): the latest encrypted backup,
    whether email really leaves the system, and student records against activated accounts."""

    permission_classes = [IsAuthenticated, capability("settings.manage")]

    def get(self, request):
        from core import backups
        from students.models import StudentRecord

        names = backups.existing()
        latest = None
        if names:
            stamp = names[-1].rsplit("ecst-", 1)[-1].split(".", 1)[0]
            try:
                latest = datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
            except ValueError:
                latest = None
        backend = settings.MAILERS.get("default", {}).get("BACKEND", "")
        records = StudentRecord.objects.all()
        return Response(
            {
                "backups": {
                    "count": len(names),
                    "latest": latest.isoformat() if latest else None,
                },
                "email": {
                    # "anymail.backends.brevo.EmailBackend" → "brevo"; "core.mail.DevEmailBackend"
                    # → "dev".
                    "backend": (
                        backend.rsplit(".", 1)[-1].removesuffix("EmailBackend").lower()
                        or backend.rsplit(".", 2)[-2]
                    ),
                    "sends_real_mail": not any(t in backend.lower() for t in _TEST_MAILERS),
                },
                "students": {
                    "records": records.count(),
                    "accounts": records.filter(user__isnull=False, user__is_active=True).count(),
                },
            }
        )
