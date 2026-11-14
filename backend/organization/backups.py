"""«النسخ الاحتياطية» on the system admin's settings: the copies, one made now, one
downloaded as a single file, and one restored over the platform (owner, 2026-11-05 and
2026-11-14)."""

import re
import secrets
import shutil
from datetime import UTC, datetime

from django.core.cache import cache
from django.db import transaction
from django.http import StreamingHttpResponse
from django.utils.translation import gettext
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.parsers import BaseParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import LoginThrottle
from audit.services import RequestMeta, record
from core import backups
from core.errors import Conflict, Invalid
from core.permissions import capability
from notifications.services import notify_admins

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


class RestoreStateSerializer(serializers.Serializer):
    state = serializers.ChoiceField(choices=["queued", "running", "done", "failed"])
    stamp = serializers.CharField()
    step = serializers.CharField(allow_blank=True)
    started = serializers.DateTimeField(allow_null=True)
    finished = serializers.DateTimeField(allow_null=True)
    error = serializers.CharField(allow_blank=True)
    code = serializers.CharField(allow_blank=True)
    kept_before = serializers.CharField(allow_null=True)
    source = serializers.ChoiceField(choices=["kept", "file"])


class BackupsSerializer(serializers.Serializer):
    running = serializers.BooleanField()
    last_failed = serializers.BooleanField()
    items = BackupSerializer(many=True)
    copies = BackupCopySerializer(many=True)
    now = BackupCountsSerializer()
    restore = RestoreStateSerializer(allow_null=True)
    empty = serializers.BooleanField()


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


def _restore_state() -> dict | None:
    from core import restore

    found = restore.state()
    if not found:
        return None
    blank = {"step": "", "started": None, "finished": None, "error": "", "code": ""}
    return {**blank, "kept_before": None, "source": "kept", **found}


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
                    "restore": _restore_state(),
                    # No student yet: a backup file from another installation may be restored.
                    "empty": backups.platform_is_empty(),
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
        notify_admins(
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


def _queued(stamp: str, source: str) -> dict:
    """«Asked for, not started yet», where the page looks for the restore's state."""
    from core import restore

    waiting = {
        "state": "queued",
        "stamp": stamp,
        "step": "",
        "started": None,
        "finished": None,
        "error": "",
        "code": "",
        "kept_before": None,
        "source": source,
    }
    cache.set(restore.STATE, waiting, timeout=3600)
    return waiting


def _ready_to_restore(user) -> None:
    """The server has the tools, and no copy is being made or restored (the same switch as
    «إنشاء نسخة الآن»)."""
    from core import restore
    from core.tasks import RUNNING

    missing = restore.missing_tools()
    if missing:
        raise Conflict(
            gettext("The server lacks the database tools a restore needs: %(tools)s.")
            % {"tools": ", ".join(missing)},
            code="no_tools",
        )
    if not cache.add(RUNNING, user.pk, timeout=3600):
        raise Conflict(
            gettext("A backup is being made or restored; wait for it to finish."),
            code="running",
        )


class BackupRestoreSerializer(serializers.Serializer):
    stamp = serializers.RegexField(r"^\d{8}T\d{6}Z$")
    password = serializers.CharField(write_only=True, trim_whitespace=False)


@extend_schema(tags=["system"])
class BackupRestoreView(APIView):
    """«استعادة»: the platform goes back to a kept copy — everything entered since is gone.
    The system admin's alone, with their own password again. The worker does it
    (core.restore.run): the copy is checked first, the platform closes, a copy of the present
    state is made, then the database is replaced all or nothing and the files swapped. The
    page learns the outcome from ``GET /backups`` (``restore``) once the platform is open."""

    permission_classes = [IsAuthenticated, capability("backups.restore")]
    throttle_classes = [LoginThrottle]

    @extend_schema(request=BackupRestoreSerializer, responses={202: RestoreStateSerializer})
    def post(self, request):
        from django.core.files.storage import default_storage

        from core.tasks import restore_backup

        data = BackupRestoreSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        stamp = data.validated_data["stamp"]
        check_own_password(request.user, data.validated_data["password"])
        if not default_storage.exists(backups.names_of(stamp)["database"]):
            raise NotFound(gettext("This backup is no longer kept."))
        _ready_to_restore(request.user)
        record(
            RequestMeta.from_request(request),
            "backup.restore_request",
            request.user,
            new={"backup": stamp},
        )
        waiting = _queued(stamp, "kept")
        actor = (request.user.pk, request.user.email)
        # After this request's own transaction: the restore replaces the very rows it wrote.
        transaction.on_commit(lambda: restore_backup.delay(stamp, *actor))
        return Response(RestoreStateSerializer(waiting).data, status=202)


# ─── A backup file from another installation, on an empty platform ──────────────────────

CHUNK_MAX = 8 * 1024 * 1024
UPLOAD_SECONDS = 24 * 3600


class OctetStreamParser(BaseParser):
    """One chunk of a file as the request's body."""

    media_type = "application/octet-stream"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read(CHUNK_MAX + 1)


class BackupUploadStartSerializer(serializers.Serializer):
    size = serializers.IntegerField(min_value=1)


class BackupUploadSerializer(serializers.Serializer):
    id = serializers.CharField()
    size = serializers.IntegerField()
    received = serializers.IntegerField()
    chunk = serializers.IntegerField()


class BackupUploadRestoreSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    file_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


def _only_when_empty() -> None:
    if not backups.platform_is_empty():
        raise Conflict(
            gettext(
                "An uploaded backup file is restored only on a platform with no students. "
                "Here, restore one of the server's own copies."
            ),
            code="not_empty",
        )


def _upload(request, upload_id: str):
    """This admin's unfinished upload and its file, or 404."""
    from core import restore

    found = cache.get(f"backup-upload:{upload_id}")
    if not found or found["user"] != request.user.pk:
        raise NotFound(gettext("This upload has ended. Choose the file again."))
    path = restore.upload_dir() / f"{upload_id}.part"
    if not path.is_file():
        raise NotFound(gettext("This upload has ended. Choose the file again."))
    return found, path


def _upload_state(upload_id: str, found: dict, path) -> dict:
    return {
        "id": upload_id,
        "size": found["size"],
        "received": path.stat().st_size,
        "chunk": CHUNK_MAX // 2,
    }


@extend_schema(tags=["system"])
class BackupUploadsView(APIView):
    """«استعادة من ملف», step one: say how large the file is. Only on an empty platform (no
    student): there a file brought from the previous host, with its password, is how the
    platform moves; anywhere else whoever holds a file would decide every row and every admin
    account. The system admin's alone. The file then arrives in chunks, so a weak connection
    resends one chunk, not the whole college."""

    permission_classes = [IsAuthenticated, capability("backups.restore")]

    @extend_schema(request=BackupUploadStartSerializer, responses={201: BackupUploadSerializer})
    def post(self, request):
        from core import restore

        data = BackupUploadStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        _only_when_empty()
        restore.purge_uploads()
        folder = restore.upload_dir()
        size = data.validated_data["size"]
        if shutil.disk_usage(folder).free < size * 16:
            raise Conflict(
                gettext("There is not enough free disk space on the server to restore."),
                code="space",
            )
        upload_id = secrets.token_urlsafe(24)
        path = folder / f"{upload_id}.part"
        path.touch(mode=0o600)
        found = {"user": request.user.pk, "size": size}
        cache.set(f"backup-upload:{upload_id}", found, timeout=UPLOAD_SECONDS)
        return Response(
            BackupUploadSerializer(_upload_state(upload_id, found, path)).data, status=201
        )


@extend_schema(tags=["system"])
class BackupUploadView(APIView):
    """One chunk, appended where the file ends. ``offset`` is where the sender thinks that
    is; when it is wrong (a chunk sent twice, or lost) nothing is written and the answer says
    how much has arrived, for the sender to go on from there."""

    permission_classes = [IsAuthenticated, capability("backups.restore")]
    parser_classes = [OctetStreamParser]

    @extend_schema(
        request={"application/octet-stream": OpenApiTypes.BINARY},
        parameters=[OpenApiParameter("offset", int, required=True)],
        responses={200: BackupUploadSerializer, 409: BackupUploadSerializer},
    )
    def put(self, request, upload_id: str):
        found, path = _upload(request, upload_id)
        chunk = request.data if isinstance(request.data, bytes) else b""
        try:
            offset = int(request.query_params.get("offset", ""))
        except ValueError:
            raise Invalid({"offset": [gettext("Enter a whole number.")]}, code="invalid") from None
        have = path.stat().st_size
        too_much = len(chunk) > CHUNK_MAX or have + len(chunk) > found["size"]
        if offset != have or not chunk or too_much:
            return Response(
                BackupUploadSerializer(_upload_state(upload_id, found, path)).data, status=409
            )
        with path.open("ab") as handle:
            handle.write(chunk)
        return Response(BackupUploadSerializer(_upload_state(upload_id, found, path)).data)


@extend_schema(tags=["system"])
class BackupUploadRestoreView(APIView):
    """Step three: the file's password opens it (checked here, before anything is asked of
    the worker), the admin's own password confirms, and the restore goes the way of a kept
    copy's (core.restore.run) — refused, again, unless the platform is still empty."""

    permission_classes = [IsAuthenticated, capability("backups.restore")]
    throttle_classes = [LoginThrottle]

    @extend_schema(request=BackupUploadRestoreSerializer, responses={202: RestoreStateSerializer})
    def post(self, request, upload_id: str):
        from core.tasks import restore_backup

        data = BackupUploadRestoreSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        check_own_password(request.user, data.validated_data["password"])
        found, path = _upload(request, upload_id)
        _only_when_empty()
        if path.stat().st_size != found["size"]:
            raise Conflict(gettext("The file has not arrived whole yet."), code="incomplete")
        try:
            with path.open("rb") as handle:
                details, key = backups.package_unlock(handle, data.validated_data["file_password"])
        except backups.WrongPassword:
            raise Invalid(
                {"file_password": [gettext("This is not the password of this file.")]},
                code="wrong_file_password",
            ) from None
        except backups.BackupCorrupt:
            path.unlink(missing_ok=True)
            raise Invalid(
                {"file": [gettext("This is not a backup file of the platform.")]},
                code="not_a_backup",
            ) from None
        stamp = str(details.get("stamp") or "")
        if not re.fullmatch(r"\d{8}T\d{6}Z", stamp):
            path.unlink(missing_ok=True)
            raise Invalid(
                {"file": [gettext("This is not a backup file of the platform.")]},
                code="not_a_backup",
            )
        _ready_to_restore(request.user)
        cache.delete(f"backup-upload:{upload_id}")
        record(
            RequestMeta.from_request(request),
            "backup.restore_request",
            request.user,
            new={"backup": stamp, "source": "file"},
        )
        waiting = _queued(stamp, "file")
        # The key waits in the cache for the worker; the task's arguments name it only.
        handle_name = f"backup-upload-key:{upload_id}"
        cache.set(handle_name, key, timeout=3600)
        args = (stamp, request.user.pk, request.user.email, str(path), handle_name)
        transaction.on_commit(lambda: restore_backup.delay(*args))
        return Response(RestoreStateSerializer(waiting).data, status=202)
