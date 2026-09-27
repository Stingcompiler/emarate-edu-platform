"""Error responses as ``application/problem+json`` (RFC 9457), docs/05 §7.

Shape: ``{type, title, status, detail, code, errors?}``. ``errors`` maps field
names to lists of messages and is present only for validation failures.
"""

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

PROBLEM_CONTENT_TYPE = "application/problem+json"

_TITLES = {
    status.HTTP_400_BAD_REQUEST: _("Invalid request"),
    status.HTTP_401_UNAUTHORIZED: _("Authentication required"),
    status.HTTP_403_FORBIDDEN: _("Not allowed"),
    status.HTTP_404_NOT_FOUND: _("Not found"),
    status.HTTP_405_METHOD_NOT_ALLOWED: _("Method not allowed"),
    status.HTTP_429_TOO_MANY_REQUESTS: _("Too many requests"),
    status.HTTP_500_INTERNAL_SERVER_ERROR: _("Server error"),
}


def problem(
    status_code: int, *, detail: str, code: str, errors: dict[str, Any] | None = None
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": str(_TITLES.get(status_code, _("Error"))),
        "status": status_code,
        "detail": detail,
        "code": code,
    }
    if errors:
        body["errors"] = errors
    return body


def _flatten(detail: Any) -> dict[str, list[str]]:
    """Turn DRF's nested ValidationError detail into ``{field: [messages]}``."""
    if isinstance(detail, dict):
        return {
            field: [str(m) for m in (msgs if isinstance(msgs, list) else [msgs])]
            for field, msgs in detail.items()
        }
    if isinstance(detail, list):
        return {"non_field_errors": [str(m) for m in detail]}
    return {"non_field_errors": [str(detail)]}


def problem_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    response = exception_handler(exc, context)
    if response is None:
        return None  # unhandled: Django's handler500 returns a problem body

    if isinstance(exc, exceptions.ValidationError):
        body = problem(
            response.status_code,
            detail=str(_("One or more fields are invalid.")),
            code="invalid",
            errors=_flatten(exc.detail),
        )
    elif isinstance(exc, exceptions.APIException):
        codes = exc.get_codes()
        body = problem(
            response.status_code,
            detail=str(exc.detail),
            code=codes if isinstance(codes, str) else "error",
        )
    else:  # Http404 / PermissionDenied converted by DRF
        detail = str(response.data.get("detail", ""))
        body = problem(response.status_code, detail=detail, code="error")

    response.data = body
    response.content_type = PROBLEM_CONTENT_TYPE
    return response
