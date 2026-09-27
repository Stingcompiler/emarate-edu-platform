from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from django.views.decorators.csp import csp_override
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerSplitView

from core import views as core_views

# /api/public/*  — anonymous, cacheable (landing site, health)
# /api/v1/*      — authenticated portal API
# /api/visitor/* — visitor session after OTP (Phase 7)
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/public/", include("core.urls_public")),
    path("api/v1/", include("config.urls_v1")),
]

if settings.SERVE_API_DOCS:
    # Swagger UI comes from a CDN. The "split" view serves its init script from
    # our own origin (no inline script), and only this view allows the CDN;
    # the site-wide policy stays strict.
    _swagger_cdn = "https://cdn.jsdelivr.net"
    _docs_csp = {
        **settings.SECURE_CSP,
        "script-src": [*settings.SECURE_CSP["script-src"], _swagger_cdn],
        "style-src": [*settings.SECURE_CSP["style-src"], _swagger_cdn],
        "img-src": [*settings.SECURE_CSP["img-src"], _swagger_cdn],
    }
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "api/docs/",
            csp_override(_docs_csp)(SpectacularSwaggerSplitView.as_view(url_name="schema")),
            name="api-docs",
        ),
    ]

# JSON problem responses for unmatched API paths and server errors.
handler404 = core_views.not_found
handler500 = core_views.server_error
