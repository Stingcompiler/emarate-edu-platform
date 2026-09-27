"""Write audit entries from the service layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

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
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        ip = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")
        return cls(
            actor=actor, ip=ip or None, user_agent=request.META.get("HTTP_USER_AGENT", "")[:255]
        )


SYSTEM = RequestMeta()


def record(
    meta: RequestMeta,
    action: str,
    target: models.Model,
    *,
    old: dict | None = None,
    new: dict | None = None,
    department_id: int | None = None,
    actor=None,
) -> AuditLog:
    return AuditLog.objects.create(
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
