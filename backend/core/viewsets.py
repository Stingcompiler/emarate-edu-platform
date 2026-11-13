"""Base viewset that applies capability + department scope + audit uniformly."""

from __future__ import annotations

from django.db import transaction
from django.db.models import ProtectedError
from django.utils.translation import gettext
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from accounts import rbac
from audit.services import RequestMeta, record, snapshot
from core.errors import Conflict
from core.permissions import capability


class ScopedModelViewSet(viewsets.ModelViewSet):
    """ModelViewSet where every row belongs to a department.

    Subclasses set:
      read_capability / write_capability / delete_capability — names in rbac.CAPABILITIES
      department_lookup — ORM path from the model to its department id
                          (e.g. "department", "course__department"); None = not scoped
      program_lookup    — ORM path to its programme (e.g. "program", "course__program"),
                          where rows live in a programme: a programme head or supervisor sees
                          and changes those of their programmes (owner, 2026-11-13)
      audit_name        — prefix for audit actions, e.g. "course"
    and implement ``department_of(obj)`` and ``department_of_data(validated_data)``
    when the department is not a direct ``department`` field.
    """

    read_capability: str
    write_capability: str | None = None
    delete_capability: str | None = None
    department_lookup: str | None = "department"
    program_lookup: str | None = None
    audit_name: str = ""

    def get_permissions(self):
        cls = capability(self.read_capability, self.write_capability, self.delete_capability)
        return [IsAuthenticated(), cls()]

    # ── scope ──────────────────────────────────────────────────────────
    def _capability(self) -> str:
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return self.read_capability
        if self.request.method == "DELETE":
            return self.delete_capability or self.write_capability or self.read_capability
        return self.write_capability or self.read_capability

    def scope(self, name: str | None = None, *, deleting: bool | None = None) -> rbac.Scope:
        if deleting is None:
            deleting = self.request.method == "DELETE"
        return rbac.scope_for(self.request.user, name or self._capability(), deleting=deleting)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.department_lookup is None:
            return queryset
        # Reads are limited to what the user may read; writes additionally
        # need write scope, checked per object below.
        # Finding the object is reading: a DELETE that unlinks (an instructor off a course) is
        # the supervisor's too; deleting itself is checked on the delete capability.
        return self.scope(self.read_capability, deleting=False).filter(
            queryset, self.department_lookup, self.program_lookup
        )

    def department_of(self, obj) -> int | None:
        return obj.department_id

    def department_of_data(self, data: dict) -> int | None:
        department = data.get("department")
        return department.pk if department is not None else None

    def program_of(self, obj) -> int | None:
        return getattr(obj, "program_id", None) if self.program_lookup else None

    def program_of_data(self, data: dict) -> int | None:
        program = data.get("program") if self.program_lookup else None
        return program.pk if program is not None else None

    def _require_scope(self, department_id: int | None, program_id: int | None = None) -> None:
        if self.department_lookup is None:
            return
        if not self.scope().allows(department_id, program_id):
            raise PermissionDenied(gettext("Outside your department scope."))

    @property
    def meta(self) -> RequestMeta:
        return RequestMeta.from_request(self.request)

    # ── writes ─────────────────────────────────────────────────────────
    def perform_create(self, serializer):
        data = serializer.validated_data
        self._require_scope(self.department_of_data(data), self.program_of_data(data))
        with transaction.atomic():
            obj = serializer.save()
            record(
                self.meta,
                f"{self.audit_name}.create",
                obj,
                new=snapshot(obj),
                department_id=self.department_of(obj),
            )

    def perform_update(self, serializer):
        obj = serializer.instance
        self._require_scope(self.department_of(obj), self.program_of(obj))
        data = serializer.validated_data
        moving_to = self.department_of_data(data)
        if moving_to is not None or self.program_of_data(data) is not None:
            # Cannot move an item into another department, or another programme's head's.
            self._require_scope(
                moving_to if moving_to is not None else self.department_of(obj),
                self.program_of_data(data) or self.program_of(obj),
            )
        old = snapshot(obj)
        with transaction.atomic():
            obj = serializer.save()
            record(
                self.meta,
                f"{self.audit_name}.update",
                obj,
                old=old,
                new=snapshot(obj),
                department_id=self.department_of(obj),
            )

    def perform_destroy(self, instance):
        self._require_scope(self.department_of(instance), self.program_of(instance))
        old = snapshot(instance)
        department_id = self.department_of(instance)
        try:
            with transaction.atomic():
                record(
                    self.meta,
                    f"{self.audit_name}.delete",
                    instance,
                    old=old,
                    department_id=department_id,
                )
                instance.delete()
        except ProtectedError:
            raise Conflict(
                gettext(
                    "This item is in use and cannot be deleted. Deactivate or archive it instead."
                ),
                code="in_use",
            ) from None
