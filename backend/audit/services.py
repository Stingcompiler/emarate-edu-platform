"""Write audit entries from the service layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ObjectDoesNotExist
from django.db import models

from .models import AuditLog


@dataclass(frozen=True)
class RequestMeta:
    """Who and where a change came from; built once per request by the view."""

    actor: Any = None  # User or None (system / anonymous flows)
    ip: str | None = None
    user_agent: str = ""

    @classmethod
    def from_request(cls, request) -> RequestMeta:
        user = getattr(request, "user", None)
        actor = user if user is not None and user.is_authenticated else None
        from core.net import client_ip

        ip = client_ip(request)
        return cls(
            actor=actor, ip=ip or None, user_agent=request.META.get("HTTP_USER_AGENT", "")[:255]
        )


SYSTEM = RequestMeta()


# Where the things the log names keep their programme: a course, a student record or a staff
# link carry it; an offering, an enrolment, a lecture, a result reach it through their course.
_PROGRAMME_PATHS = (
    ("program_id",),
    ("course", "program_id"),
    ("offering", "course", "program_id"),
    ("student_record", "program_id"),
    ("intake", "program_id"),
)


def program_of(target: models.Model) -> int | None:
    """The programme ``target`` lives in, when it lives in one (owner, 2026-11-13: courses,
    lectures and students belong to a programme, whose head reads its log)."""
    if target._meta.label_lower == "organization.program":
        return target.pk
    for path in _PROGRAMME_PATHS:
        value = target
        try:
            for name in path:
                value = getattr(value, name)
        except (AttributeError, ObjectDoesNotExist):
            continue
        if isinstance(value, int):
            return value
    return None


def record(
    meta: RequestMeta,
    action: str,
    target: models.Model,
    *,
    old: dict | None = None,
    new: dict | None = None,
    department_id: int | None = None,
    program_id: int | None = None,
    actor=None,
) -> AuditLog:
    """``department_id`` files the entry under a department, for its roles to read. Filed
    under a department, it is also filed under the programme the target lives in — or
    ``program_id``, when the target is a person (a staff link, a programme role)."""
    if program_id is None and department_id is not None:
        program_id = program_of(target)
    return AuditLog.objects.create(
        program_id=program_id,
        actor=actor if actor is not None else meta.actor,
        action=action,
        target_type=target._meta.label_lower,
        target_id=str(target.pk),
        target_repr=str(target)[:255],
        old=old,
        new=new,
        department_id=department_id,
        ip=meta.ip,
        user_agent=meta.user_agent,
    )


def snapshot(instance: models.Model, fields: list[str] | None = None) -> dict:
    """JSON-safe copy of concrete field values, for old/new diffs."""
    data = {}
    for field in instance._meta.concrete_fields:
        if fields is not None and field.name not in fields:
            continue
        value = getattr(instance, field.attname)
        if value is not None and not isinstance(value, (str, int, float, bool)):
            value = str(value)
        data[field.attname] = value
    return data
