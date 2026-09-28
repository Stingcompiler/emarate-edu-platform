"""CORS for the public site (docs/02 §6), without a third-party package.

Only anonymous ``/api/public/*`` endpoints answer cross-origin requests, and
only for origins listed in ``PUBLIC_SITE_ORIGINS`` (the Astro site). No
credentials are allowed: those endpoints use no cookies or sessions.
"""

from django.conf import settings
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers

PREFIX = "/api/public/"


class PublicCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        allowed = (
            origin is not None
            and request.path.startswith(PREFIX)
            and origin in getattr(settings, "PUBLIC_SITE_ORIGINS", [])
        )
        preflight = (
            request.method == "OPTIONS" and "Access-Control-Request-Method" in request.headers
        )
        response = HttpResponse(status=204) if allowed and preflight else self.get_response(request)
        if request.path.startswith(PREFIX):
            patch_vary_headers(response, ["Origin"])
        if allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type"
            response["Access-Control-Max-Age"] = "86400"
        return response


class PermissionsPolicyMiddleware:
    """Deny browser features the platform never uses (docs/05 §9 "Headers")."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        policy = getattr(settings, "PERMISSIONS_POLICY", "")
        if policy:
            response.headers.setdefault("Permissions-Policy", policy)
        return response
