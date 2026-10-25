"""``Idempotency-Key`` for writes that must happen once (docs/05 §7; review 2026-10-25 R21).

The first request with a key reserves it (a unique row per user and key, so two copies racing
each other cannot both run) and saves its answer; a repeat gets that answer back without doing
the work again. The same key on a different request is refused (422), a repeat while the first
is still running gets 409, and a failed first request keeps nothing, so it can be retried.
A view may say the saved answer no longer holds (``stale``: an exam attempt reopened since its
submission) and the repeat gets 409 instead of an answer that is no longer true.
Keys live 24 hours.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.response import Response

from .errors import Conflict
from .models import IdempotencyRecord

TTL = timedelta(hours=24)


class KeyReused(Conflict):
    status_code = 422
    default_code = "idempotency_key_reused"


def _digest(request) -> str:
    return hashlib.sha256(request.body or b"").hexdigest()


def run_once(
    request, perform: Callable[[], Response], *, stale: Callable[[], bool] | None = None
) -> Response:
    key = (request.META.get("HTTP_IDEMPOTENCY_KEY") or "").strip()[:100]
    if not key:
        return perform()
    user, method, path, digest = request.user, request.method, request.path, _digest(request)
    IdempotencyRecord.objects.filter(
        user=user, key=key, created_at__lt=timezone.now() - TTL
    ).delete()
    try:
        with transaction.atomic():
            record = IdempotencyRecord.objects.create(
                user=user, key=key, method=method, path=path, body_digest=digest
            )
    except IntegrityError:
        record = None
    if record is None:  # the key was used before
        found = IdempotencyRecord.objects.get(user=user, key=key)
        if (found.method, found.path, found.body_digest) != (method, path, digest):
            raise KeyReused(gettext("This Idempotency-Key was used for another request."))
        if found.status_code is None:
            raise Conflict(gettext("The first request with this key is still running."))
        if stale is not None and stale():
            raise Conflict(
                gettext("This changed since the first request; send it again with a new key."),
                code="stale",
            )
        return Response(found.response, status=found.status_code)
    try:
        response = perform()
    except Exception:
        record.delete()  # refused or failed: the key is free for a retry
        raise
    if 200 <= response.status_code < 300:
        record.status_code = response.status_code
        record.response = response.data
        record.save(update_fields=["status_code", "response"])
    else:
        record.delete()
    return response
