"""Domain errors raised by services; rendered as problem+json by core.exceptions."""

from django.utils.translation import gettext_lazy
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = gettext_lazy("The request conflicts with the current state.")
    default_code = "conflict"


class Locked(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = gettext_lazy("Too many failed attempts. Try again later.")
    default_code = "locked"


class Invalid(ValidationError):
    """A 400 with a specific problem ``code`` (plain ValidationError renders "invalid")."""

    def __init__(self, detail, code: str):
        super().__init__(detail, code=code)
        self.problem_code = code
