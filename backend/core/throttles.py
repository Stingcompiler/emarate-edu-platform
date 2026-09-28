"""Throttle for the cached public catalogue (site settings, pages, news, programs…)."""

import hmac

from django.conf import settings
from rest_framework.throttling import AnonRateThrottle


class PublicReadThrottle(AnonRateThrottle):
    """Per-IP limit for read-only public content, higher than the default anon rate.

    The static-site build (apps/landing) fetches every page in a burst; it sends
    ``X-Site-Build: <SITE_BUILD_TOKEN>`` and is not throttled. Lookups that could
    be used to enumerate (application or inquiry status) keep the default rate.
    """

    scope = "public_read"

    def allow_request(self, request, view):
        token = getattr(settings, "SITE_BUILD_TOKEN", "")
        sent = request.headers.get("X-Site-Build", "")
        if token and sent and hmac.compare_digest(token, sent):
            return True
        return super().allow_request(request, view)
