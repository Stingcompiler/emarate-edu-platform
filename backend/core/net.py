"""The client's IP address, trusting X-Forwarded-For only from known proxies.

Behind Cloudflare and Render each proxy appends the address it received the
request from, so the real client is the entry ``TRUSTED_PROXIES`` places from
the right (the same rule DRF uses for throttling with ``NUM_PROXIES``). With
``TRUSTED_PROXIES = 0`` (development) the header is ignored entirely, so a
client cannot spoof its address in audit logs or throttles.
"""

from django.conf import settings


def client_ip(request) -> str | None:
    proxies = int(getattr(settings, "TRUSTED_PROXIES", 0) or 0)
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if proxies > 0 and forwarded:
        addresses = [a.strip() for a in forwarded.split(",") if a.strip()]
        if addresses:
            return addresses[-min(proxies, len(addresses))]
    return request.META.get("REMOTE_ADDR") or None
