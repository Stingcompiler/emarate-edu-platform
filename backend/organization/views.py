from datetime import UTC, datetime

from django.conf import settings
from django.db import transaction
from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rbac
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


class DepartmentUsageProgramSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name_ar = serializers.CharField()
    students = serializers.IntegerField()
    courses = serializers.IntegerField()
    applications = serializers.IntegerField()
    free = serializers.BooleanField()


class DepartmentUsageRoleSerializer(serializers.Serializer):
    user = serializers.CharField()
    role = serializers.CharField()


class DepartmentUsageSerializer(serializers.Serializer):
    programs = DepartmentUsageProgramSerializer(many=True)
    courses = serializers.IntegerField()
    students = serializers.IntegerField()
    members = serializers.IntegerField()
    roles = DepartmentUsageRoleSerializer(many=True)
    history = serializers.IntegerField()
    can_delete = serializers.BooleanField()
    can_merge = serializers.BooleanField()


class DepartmentMergeSerializer(serializers.Serializer):
    into = serializers.PrimaryKeyRelatedField(queryset=Department.objects.all())


class DepartmentMergeResultSerializer(serializers.Serializer):
    result = serializers.ChoiceField(choices=["deleted", "stopped"])


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
    # A programme's head sees the department that holds it (owner, 2026-11-13).
    program_lookup = "programs"
    serializer_class = DepartmentSerializer
    audit_name = "department"
    site_section = "departments"
    filterset_fields = ["college", "is_active"]
    search_fields = ["name_ar", "name_en", "code"]

    def get_queryset(self):
        return super().get_queryset().distinct()  # one row, whatever programmes are held

    def program_of(self, obj):
        return None

    def _manager(self, *, deleting: bool = False):
        # Merging deletes the department: never the system supervisor's (rbac.scope_for).
        if not rbac.can(self.request.user, "structure.manage", deleting=deleting):
            raise PermissionDenied()

    @extend_schema(responses=DepartmentUsageSerializer)
    @action(detail=True, methods=["get"])
    def usage(self, request, pk=None):
        """What is on the department, and whether it can be merged or deleted (admin only)."""
        self._manager()
        return Response(DepartmentUsageSerializer(services.usage(self.get_object())).data)

    @extend_schema(request=DepartmentMergeSerializer, responses=DepartmentMergeResultSerializer)
    @action(detail=True, methods=["post"])
    def merge(self, request, pk=None):
        """Its programmes into another department, then it is deleted."""
        self._manager(deleting=True)
        body = DepartmentMergeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        result = services.merge(self.meta, self.get_object(), body.validated_data["into"])
        return Response({"result": result})

    def destroy(self, request, *args, **kwargs):
        # ?with_programs=1: the department and its free programmes in one step.
        if request.query_params.get("with_programs") == "1":
            services.delete_with_programs(self.meta, self.get_object())
            return Response(status=status.HTTP_204_NO_CONTENT)
        return super().destroy(request, *args, **kwargs)


class ProgramViewSet(_CodedViewSet):
    """Scoped like departments: a department role sees its departments' programs."""

    queryset = Program.objects.select_related("department")
    department_lookup = "department"
    program_lookup = "pk"  # a programme's head sees their programme
    serializer_class = ProgramSerializer
    audit_name = "program"
    site_section = "programs"
    filterset_fields = ["department", "degree", "is_active"]
    search_fields = ["name_ar", "name_en", "code"]

    def program_of(self, obj):
        return obj.pk

    def program_of_data(self, data):
        return None

    def perform_update(self, serializer):
        with transaction.atomic():
            super().perform_update(serializer)
            # Its teaching staff follow it to another department (their department is the
            # programme's — owner, 2026-11-13).
            services.memberships_follow(serializer.instance)

    def perform_destroy(self, instance):
        # Intakes nobody applied to go with the programme (it may have been opened for
        # applying by mistake, #223); one with an application keeps it in use (R28).
        with transaction.atomic():
            # Its head, supervisor and staff links end with it — on the record.
            services.end_program_links(self.meta, instance)
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


class BackupSerializer(serializers.Serializer):
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=["database", "files"])
    at = serializers.DateTimeField(allow_null=True)
    size = serializers.IntegerField(allow_null=True)


class BackupsSerializer(serializers.Serializer):
    running = serializers.BooleanField()
    last_failed = serializers.BooleanField()
    items = BackupSerializer(many=True)


def _stamp(name: str):
    stamp = name.rsplit("-", 1)[-1].split(".", 1)[0]
    try:
        return datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except ValueError:
        return None


@extend_schema(tags=["system"])
class BackupsView(APIView):
    """The encrypted backups, newest first, and «إنشاء نسخة الآن» (owner, 2026-11-05). A copy
    is made by the worker, like the daily timer's; one at a time. Restoring stays a server
    operation (docs/runbook.md §5): from the web it would let a taken-over admin account
    replace the college's data, which is what the backups protect."""

    permission_classes = [IsAuthenticated, capability("settings.manage")]

    @extend_schema(responses=BackupsSerializer)
    def get(self, request):
        from django.core.cache import cache
        from django.core.files.storage import default_storage

        from core import backups
        from core.tasks import LAST_ERROR, RUNNING

        items = []
        for kind, suffix in (("database", backups.DB_SUFFIX), ("files", backups.MEDIA_SUFFIX)):
            for name in backups.existing(suffix):
                try:
                    size = default_storage.size(name)
                except (OSError, NotImplementedError):
                    size = None
                items.append(
                    {
                        "name": name.rsplit("/", 1)[-1],
                        "kind": kind,
                        "at": _stamp(name),
                        "size": size,
                    }
                )
        items.sort(key=lambda i: (i["at"] is None, i["at"]), reverse=True)
        return Response(
            BackupsSerializer(
                {
                    "running": bool(cache.get(RUNNING)),
                    "last_failed": bool(cache.get(LAST_ERROR)),
                    "items": items,
                }
            ).data
        )

    @extend_schema(request=None, responses={202: BackupsSerializer})
    def post(self, request):
        from django.core.cache import cache

        from core.errors import Conflict
        from core.tasks import RUNNING, create_backup

        # An hour at most: a crashed worker never blocks the button for good.
        if not cache.add(RUNNING, request.user.pk, timeout=3600):
            raise Conflict(
                gettext("A backup is being made; wait for it to finish."), code="running"
            )
        record(RequestMeta.from_request(request), "backup.request", request.user)
        create_backup.delay(request.user.pk)
        response = self.get(request)
        response.status_code = 202
        return response
