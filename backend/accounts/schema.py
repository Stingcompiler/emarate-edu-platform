"""OpenAPI description of the cookie-based JWT authentication."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class CookieJWTScheme(OpenApiAuthenticationExtension):
    target_class = "accounts.authentication.CookieJWTAuthentication"
    name = "jwtCookieAuth"

    def get_security_definition(self, auto_schema):
        from django.conf import settings

        return {"type": "apiKey", "in": "cookie", "name": settings.AUTH_COOKIE_ACCESS}


class VisitorScheme(OpenApiAuthenticationExtension):
    target_class = "contacts.visitor.VisitorAuthentication"
    name = "visitorToken"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Visitor <token> — from /api/public/visitor/verify",
        }
