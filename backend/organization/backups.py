"""«النسخ الاحتياطية» on the system admin's settings: the copies, one made now, and one
downloaded as a single file (owner, 2026-11-05 and 2026-11-14)."""

import secrets
from datetime import UTC, datetime

from django.core.cache import cache
from django.http import StreamingHttpResponse
from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import LoginThrottle
from audit.services import RequestMeta, record
from core import backups
from core.errors import Conflict, Invalid
from core.permissions import capability

# A download waits this long for the browser to fetch it, once.
TICKET_SECONDS = 120


class BackupSerializer(serializers.Serializer):
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=["database", "files"])
    at = serializers.DateTimeField(allow_null=True)
    size = serializers.IntegerField(allow_null=True)


class BackupCountsSerializer(serializers.Serializer):
    users = serializers.IntegerField()
    students = serializers.IntegerField()
    courses = serializers.IntegerField()
    applications = serializers.IntegerField()


class BackupCopySerializer(serializers.Serializer):
    stamp = serializers.CharField()
    at = serializers.DateTimeField()
    size = serializers.IntegerField()
    files = serializers.BooleanField()
    counts = BackupCountsSerializer(allow_null=True)


class BackupsSerializer(serializers.Serializer):
    running = serializers.BooleanField()
    last_failed = serializers.BooleanField()
    items = BackupSerializer(many=True)
    copies = BackupCopySerializer(many=True)
    now = BackupCountsSerializer()


def _stamp(name: str):
    stamp = name.rsplit("-", 1)[-1].split(".", 1)[0]
    try:
        return datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except ValueError:
        return None


def _size(name: str) -> int | None:
    from django.core.files.storage import default_storage

    try:
        return default_storage.size(name)
    except (OSError, NotImplementedError):
        return None


def _counts(details: dict | None) -> dict | None:
    counts = (details or {}).get("counts")
    if not isinstance(counts, dict) or set(counts) != set(backups.COUNTED):
        return None
    return counts


@extend_schema(tags=["system"])
class BackupsView(APIView):
    """The encrypted backups, newest first, and «إنشاء نسخة الآن» (owner, 2026-11-05). A copy
    is made by the worker, like the daily timer's; one at a time. ``copies`` is the same list
    by copy — the database and the files of one moment — which is what is downloaded."""

    permission_classes = [IsAuthenticated, capability("settings.manage")]

    @extend_schema(responses=BackupsSerializer)
    def get(self, request):
        from core.tasks import LAST_ERROR, RUNNING

        items = []
        copies = {}
        for kind, suffix in (("database", backups.DB_SUFFIX), ("files", backups.MEDIA_SUFFIX)):
            for name in backups.existing(suffix):
                at, size = _stamp(name), _size(name)
                items.append(
                    {"name": name.rsplit("/", 1)[-1], "kind": kind, "at": at, "size": size}
                )
                if at is None:
                    continue
                stamp = at.strftime("%Y%m%dT%H%M%SZ")
                if kind == "database":
                    copies[stamp] = {"stamp": stamp, "at": at, "size": size or 0, "files": False}
                elif stamp in copies:
                    copies[stamp]["size"] += size or 0
                    copies[stamp]["files"] = True
        items.sort(key=lambda i: (i["at"] is None, i["at"]), reverse=True)
        newest = sorted(copies.values(), key=lambda c: c["at"], reverse=True)
        for copy in newest:
            copy["counts"] = _counts(backups.info(copy["stamp"]))
        return Response(
            BackupsSerializer(
                {
                    "running": bool(cache.get(RUNNING)),
                    "last_failed": bool(cache.get(LAST_ERROR)),
                    "items": items,
                    "copies": newest,
                    "now": backups.snapshot(),
                }
            ).data
        )

    @extend_schema(request=None, responses={202: BackupsSerializer})
    def post(self, request):
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


class BackupDownloadSerializer(serializers.Serializer):
    stamp = serializers.RegexField(r"^\d{8}T\d{6}Z$")
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    file_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        min_length=backups.PASSWORD_MIN,
        max_length=128,
    )


class BackupTicketSerializer(serializers.Serializer):
    url = serializers.CharField()
    filename = serializers.CharField()


def check_own_password(user, password: str) -> None:
    """The admin types their own password again: an unattended, signed-in browser is not
    enough to take every record out of the college, or to replace them."""
    if not user.check_password(password):
        raise Invalid({"password": [gettext("The password is wrong.")]}, code="wrong_password")


def tell_the_admins(actor, title: str, body: str) -> None:
    """Every system admin and supervisor hears of it, in the portal and by e-mail — the one
    who did it too: a copy taken in their name is theirs to notice."""
    from accounts.models import User
    from accounts.rbac import Role
    from notifications.models import Category, Channel
    from notifications.services import notify

    admins = User.objects.filter(
        is_active=True, role_assignments__role__in=[Role.SYSTEM_ADMIN, Role.SYSTEM_SUPERVISOR]
    ).distinct()
    notify(
        list(admins),
        category=Category.OPS,
        title=title,
        body=body,
        action_url="/system/settings",
        channels=[Channel.INAPP, Channel.EMAIL],
    )


@extend_schema(tags=["system"])
class BackupDownloadView(APIView):
    """«تنزيل»: one file holding a copy's database and files, encrypted with a password typed
    here — so on another host the file and that password are all that is needed, and the
    server's own key never leaves it. The system admin's alone, with their own password again;
    on the record, and every admin is told. The answer is a link that works once, for two
    minutes: the browser fetches it as an ordinary download, streamed, whatever its size."""

    permission_classes = [IsAuthenticated, capability("backups.download")]
    throttle_classes = [LoginThrottle]

    @extend_schema(request=BackupDownloadSerializer, responses=BackupTicketSerializer)
    def post(self, request):
        data = BackupDownloadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        stamp = data.validated_data["stamp"]
        check_own_password(request.user, data.validated_data["password"])
        from django.core.files.storage import default_storage

        if not default_storage.exists(backups.names_of(stamp)["database"]):
            raise NotFound(gettext("This backup is no longer kept."))
        ticket = secrets.token_urlsafe(32)
        cache.set(
            f"backup-download:{ticket}",
            {
                "user": request.user.pk,
                "stamp": stamp,
                "key": backups.package_key(data.validated_data["file_password"]),
            },
            timeout=TICKET_SECONDS,
        )
        record(
            RequestMeta.from_request(request),
            "backup.download",
            request.user,
            new={"backup": stamp},
        )
        tell_the_admins(
            request.user,
            "نُزّلت نسخة احتياطية من المنصة",
            f"نزّل {request.user.full_name_ar} نسخة {stamp} كاملةً (قاعدة البيانات والملفات) "
            "في ملف مشفّر بكلمة سر. إن لم يكن ذلك متوقعًا فراجع سجل العمليات وغيّر كلمات المرور.",
        )
        return Response(
            {
                "url": f"/api/v1/backups/file/{ticket}",
                "filename": f"ecst-backup-{stamp}{backups.PACKAGE_SUFFIX}",
            }
        )


@extend_schema(tags=["system"], responses={(200, "application/octet-stream"): bytes})
class BackupFileView(APIView):
    """The file itself, for the link ``BackupDownloadView`` gave: once, to the same admin."""

    permission_classes = [IsAuthenticated, capability("backups.download")]

    def get(self, request, ticket: str):
        key = f"backup-download:{ticket}"
        waiting = cache.get(key)
        if not waiting or waiting["user"] != request.user.pk:
            raise NotFound(gettext("This download link has ended. Ask for the file again."))
        cache.delete(key)
        try:
            stream = backups.package(waiting["stamp"], waiting["key"])
        except FileNotFoundError:
            raise NotFound(gettext("This backup is no longer kept.")) from None
        response = StreamingHttpResponse(stream, content_type="application/octet-stream")
        name = f"ecst-backup-{waiting['stamp']}{backups.PACKAGE_SUFFIX}"
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        response["Cache-Control"] = "no-store"
        return response
