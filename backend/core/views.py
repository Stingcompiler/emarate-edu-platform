import logging

from django.conf import settings
from django.core.cache import cache
from django.db import DatabaseError, connection
from django.http import HttpRequest, JsonResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .exceptions import PROBLEM_CONTENT_TYPE, problem

logger = logging.getLogger(__name__)

_HealthSerializer = inline_serializer(
    name="Health",
    fields={
        "status": serializers.ChoiceField(choices=["ok", "degraded"]),
        "database": serializers.ChoiceField(choices=["ok", "error"]),
        "cache": serializers.ChoiceField(choices=["ok", "error"]),
        "version": serializers.CharField(),
        "server_time": serializers.DateTimeField(),
    },
)


def _database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            return cursor.fetchone() == (1,)
    except DatabaseError:
        logger.exception("Health check: database unavailable")
        return False


def _cache_ok() -> bool:
    try:
        cache.set("health:ping", "pong", timeout=5)
        return cache.get("health:ping") == "pong"
    except Exception:  # any backend error means the cache is unusable
        logger.exception("Health check: cache unavailable")
        return False


@extend_schema(
    operation_id="health",
    summary="Service health",
    description="Checks the database and cache. Returns 503 when either is unavailable.",
    responses={200: _HealthSerializer, 503: _HealthSerializer},
    tags=["system"],
)
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle])
def health(request: Request) -> Response:
    database, cache_ = _database_ok(), _cache_ok()
    healthy = database and cache_
    return Response(
        {
            "status": "ok" if healthy else "degraded",
            "database": "ok" if database else "error",
            "cache": "ok" if cache_ else "error",
            "version": settings.APP_VERSION,
            "server_time": timezone.now(),
        },
        status=200 if healthy else 503,
        headers={"Cache-Control": "no-store"},
    )


def not_found(request: HttpRequest, exception: Exception | None = None) -> JsonResponse:
    return JsonResponse(
        problem(404, detail="No endpoint matches this path.", code="not_found"),
        status=404,
        content_type=PROBLEM_CONTENT_TYPE,
    )


def server_error(request: HttpRequest) -> JsonResponse:
    return JsonResponse(
        problem(500, detail="An unexpected error occurred.", code="server_error"),
        status=500,
        content_type=PROBLEM_CONTENT_TYPE,
    )
