"""The system admin deletes a student, many students, a course or a department with everything
it holds (owner, 2026-11-15; core.deletions). First what would go, then the deletion itself,
confirmed by typing what is deleted and the admin's own password.

A department, and more than ``BACKUP_FROM`` students at once, are deleted by the worker after a
backup of the whole platform: the page follows the job (``deletions/jobs/<id>``)."""

from __future__ import annotations

import secrets

from django.core.cache import cache
from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import LoginThrottle
from audit.services import RequestMeta
from core import deletions
from core.errors import Conflict, Invalid
from core.permissions import capability

BACKUP_FROM = 50
JOB_SECONDS = 7 * 24 * 3600
KINDS = ["student", "course", "program", "department"]


class RecordDeletionTargetSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=KINDS)
    ids = serializers.ListField(
        child=serializers.CharField(max_length=64), min_length=1, max_length=5000
    )

    def validate(self, attrs):
        if attrs["kind"] != "student" and len(attrs["ids"]) != 1:
            raise serializers.ValidationError({"ids": [gettext("One at a time.")]})
        return attrs


class RecordDeletionSerializer(RecordDeletionTargetSerializer):
    reason = serializers.CharField(max_length=500, allow_blank=True, default="")
    confirm = serializers.CharField(max_length=200, trim_whitespace=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    # A head's request this deletion approves (owner, 2026-11-15): it is approved only when the
    # rows are gone, and its targets must be exactly these.
    request = serializers.IntegerField(required=False, allow_null=True, default=None)


class RecordDeletionItemSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    confirm = serializers.CharField()


class RecordDeletionPreviewSerializer(serializers.Serializer):
    items = RecordDeletionItemSerializer(many=True)
    counts = serializers.DictField(child=serializers.IntegerField())
    confirm = serializers.CharField()
    backup = serializers.BooleanField()


class RecordDeletionJobSerializer(serializers.Serializer):
    id = serializers.CharField()
    state = serializers.ChoiceField(choices=["queued", "running", "done", "failed"])
    kind = serializers.CharField()
    count = serializers.IntegerField()
    removed = serializers.DictField(child=serializers.IntegerField(), allow_null=True)
    backup = serializers.CharField(allow_blank=True)
    error = serializers.CharField(allow_blank=True)


class RecordDeletionResultSerializer(serializers.Serializer):
    removed = serializers.DictField(child=serializers.IntegerField(), allow_null=True)
    job = RecordDeletionJobSerializer(allow_null=True)


def _rows(kind: str, ids: list[str]) -> list:
    if kind != "student" and not all(i.isdigit() for i in ids):
        raise NotFound()
    rows = deletions.find(kind, ids)
    if len(rows) != len(set(ids)):
        raise NotFound(gettext("Some of them no longer exist."))
    return rows


def _id(row) -> str:
    return str(getattr(row, "public_id", row.pk))


def _name(kind: str, row) -> str:
    if kind == "student":
        return f"{row.university_number} · {row.full_name_ar}"
    if kind in ("course", "program"):
        return f"{row.code} · {row.name_ar}"
    return row.name_ar


def _confirm_text(kind: str, rows: list) -> str:
    """What the admin types to confirm: the student's number, the course's code, the
    programme's or the department's name — or, for many students, how many."""
    if len(rows) > 1:
        return str(len(rows))
    row = rows[0]
    if kind == "student":
        return row.university_number
    return row.code if kind == "course" else row.name_ar


def _in_background(kind: str, rows: list) -> bool:
    # A programme or a department: always after a backup (owner, 2026-11-16).
    return kind in ("program", "department") or len(rows) > BACKUP_FROM


@extend_schema(tags=["system"])
class DeletionPreviewView(APIView):
    """What deleting them removes, counted by doing it and rolling it back."""

    permission_classes = [IsAuthenticated, capability("records.delete_all")]

    @extend_schema(
        request=RecordDeletionTargetSerializer, responses=RecordDeletionPreviewSerializer
    )
    def post(self, request):
        data = RecordDeletionTargetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        kind = data.validated_data["kind"]
        rows = _rows(kind, data.validated_data["ids"])
        counts = deletions.preview(kind, rows)
        return Response(
            RecordDeletionPreviewSerializer(
                {
                    "items": [
                        {
                            "id": str(getattr(r, "public_id", r.pk)),
                            "name": _name(kind, r),
                            "confirm": _confirm_text(kind, [r]),
                        }
                        for r in rows
                    ],
                    "counts": counts,
                    "confirm": _confirm_text(kind, rows),
                    "backup": _in_background(kind, rows),
                }
            ).data
        )


@extend_schema(tags=["system"])
class DeletionView(APIView):
    """The deletion. A programme, a department, or more than 50 students, goes to the worker
    after a backup (202 and the job); the rest is done here (200 and what was removed)."""

    permission_classes = [IsAuthenticated, capability("records.delete_all")]
    throttle_classes = [LoginThrottle]

    @extend_schema(
        request=RecordDeletionSerializer,
        responses={200: RecordDeletionResultSerializer, 202: RecordDeletionResultSerializer},
    )
    def post(self, request):
        from organization.backups import check_own_password

        data = RecordDeletionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        kind = data.validated_data["kind"]
        check_own_password(request.user, data.validated_data["password"])
        rows = _rows(kind, data.validated_data["ids"])
        if data.validated_data["confirm"] != _confirm_text(kind, rows):
            raise Invalid(
                {"confirm": [gettext("Type exactly what is shown to confirm.")]}, code="confirm"
            )
        reason = data.validated_data["reason"]
        asked = data.validated_data["request"]
        ids = [_id(r) for r in rows]
        if not _in_background(kind, rows):
            from django.db import transaction

            from content import deletions as requests

            meta = RequestMeta.from_request(request)
            with transaction.atomic():
                req = requests.pending_record_request(asked, kind, ids) if asked else None
                removed = deletions.delete(
                    meta,
                    kind,
                    rows,
                    reason=reason or (req.reason if req else ""),
                    request_id=asked,
                )
                if req is not None:
                    requests.approved(meta, req)
            return Response(RecordDeletionResultSerializer({"removed": removed, "job": None}).data)
        if asked:
            from django.db import transaction

            from content import deletions as requests

            with transaction.atomic():
                requests.pending_record_request(asked, kind, ids)  # checked now, again at the end
        job = start_job(request.user, kind, ids, reason, request_id=asked)
        return Response(
            RecordDeletionResultSerializer({"removed": None, "job": job}).data, status=202
        )


def start_job(user, kind: str, ids: list[str], reason: str, request_id: int | None = None) -> dict:
    from core import backups
    from core.tasks import delete_records

    lock = backups.lock_take("deletion", backups.QUEUED_LEASE)
    if lock is None:
        raise Conflict(
            gettext("A backup is being made or restored; try again when it ends."),
            code="running",
        )
    job = {
        "id": secrets.token_urlsafe(12),
        "state": "queued",
        "kind": kind,
        "count": len(ids),
        "removed": None,
        "backup": "",
        "error": "",
    }
    cache.set(f"deletion-job:{job['id']}", job, timeout=JOB_SECONDS)
    delete_records.delay(job["id"], kind, ids, user.pk, reason, request_id, lock=lock)
    return job


@extend_schema(tags=["system"])
class DeletionJobView(APIView):
    permission_classes = [IsAuthenticated, capability("records.delete_all")]

    @extend_schema(responses=RecordDeletionJobSerializer)
    def get(self, request, job_id: str):
        job = cache.get(f"deletion-job:{job_id}")
        if job is None:
            raise NotFound()
        return Response(RecordDeletionJobSerializer(job).data)
