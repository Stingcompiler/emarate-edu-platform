"""JWT in HttpOnly cookies, with CSRF protection (docs/05 §7).

Tokens never touch JavaScript: the browser sends the ``access`` cookie with
every request. Because cookies are sent automatically, unsafe requests must
also carry the CSRF header (``X-CSRFToken``), the same way Django sessions work.
"""

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from django.utils.translation import gettext
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


class _CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if not raw_token:
            return None
        validated = self.get_validated_token(raw_token)
        user = self.get_user(validated)
        if not user.is_active:
            raise exceptions.AuthenticationFailed(
                gettext("User is inactive."), code="user_inactive"
            )
        if validated.get("tv", 0) != user.token_version:
            # Signed out everywhere since this token was issued (review 2026-10-08, R05).
            raise exceptions.AuthenticationFailed(gettext("Session expired."), code="token_revoked")
        self._enforce_csrf(request)
        return user, validated

    def authenticate_header(self, request):
        # Makes DRF answer 401 (not 403) when the cookie is missing or expired,
        # which is what the portal's silent-refresh logic listens for.
        return 'Cookie realm="api"'

    @staticmethod
    def _enforce_csrf(request):
        check = _CSRFCheck(lambda req: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(
                gettext("CSRF failed: %(reason)s") % {"reason": reason}
            )
