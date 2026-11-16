"""Production: PostgreSQL, Redis, real email, hardened HTTPS (docs/05 §4, §9).

Every secret comes from the environment; missing required values fail at
startup rather than at the first request.
"""

import dj_database_url

from .base import *  # noqa: F403
from .base import LOGGING
from .env import env, env_bool, env_list

SECRET_KEY = env("DJANGO_SECRET_KEY", required=True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")

DATABASES = {
    "default": dj_database_url.parse(
        env("DATABASE_URL", required=True),
        conn_max_age=60,
        conn_health_checks=True,
    )
}

_redis_url = env("REDIS_URL", required=True)
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": _redis_url}
}
CELERY_BROKER_URL = _redis_url

# Anymail provider is chosen by environment (Brevo, Resend, ...); see .env.example.
# Or plain SMTP (e.g. Brevo's smtp-relay with an SMTP key) when no API key is available.
_MAILER = env("MAILER_BACKEND", "anymail.backends.brevo.EmailBackend")
_SMTP = "django.core.mail.backends.smtp.EmailBackend"
MAILERS = {"default": {"BACKEND": _MAILER}}
if _MAILER == _SMTP:
    MAILERS["default"]["OPTIONS"] = {
        "host": env("SMTP_HOST", required=True),
        "port": int(env("SMTP_PORT", "587")),
        "username": env("SMTP_USER", required=True),
        "password": env("SMTP_PASSWORD", required=True),
        "use_tls": env_bool("SMTP_TLS", True),
        "timeout": 20,
    }
ANYMAIL = {
    "BREVO_API_KEY": env("BREVO_API_KEY"),
    "RESEND_API_KEY": env("RESEND_API_KEY"),
}
INSTALLED_APPS = [*INSTALLED_APPS, "anymail"]  # noqa: F405

# ─── Files: Bunny Storage (two zones) + signed CDN links + Bunny Stream ───
# Every uploaded file lives on Bunny (owner, 2026-11-16): the private zone, read through
# token-signed links only, and the public zone (the site's images, photos, the logo) behind a
# plain pull zone. The keys are read even while MEDIA_BACKEND=local: `move_files_to_bunny` copies
# the server's files there before the switch (scripts/vps/set-bunny-storage.sh). The backups stay
# on the server's own disk either way (core.backups.default_storage). Set MEDIA_BACKEND=local
# only for a throwaway deployment; `check --deploy` then warns (core.W001).
MEDIA_BACKEND = env("MEDIA_BACKEND", "bunny")
_on_bunny = MEDIA_BACKEND == "bunny"
BUNNY_STORAGE_HOST = env("BUNNY_STORAGE_HOST", "https://storage.bunnycdn.com")
BUNNY_STORAGE_ZONE = env("BUNNY_STORAGE_ZONE", "", required=_on_bunny)
BUNNY_STORAGE_KEY = env("BUNNY_STORAGE_KEY", "", required=_on_bunny)
BUNNY_PULL_ZONE_URL = env("BUNNY_PULL_ZONE_URL", "", required=_on_bunny)
BUNNY_TOKEN_KEY = env("BUNNY_TOKEN_KEY", "", required=_on_bunny)
BUNNY_PUBLIC_STORAGE_ZONE = env("BUNNY_PUBLIC_STORAGE_ZONE", "", required=_on_bunny)
BUNNY_PUBLIC_STORAGE_KEY = env("BUNNY_PUBLIC_STORAGE_KEY", "", required=_on_bunny)
BUNNY_PUBLIC_URL = env("BUNNY_PUBLIC_URL", "", required=_on_bunny)
BUNNY_STREAM_LIBRARY_ID = env("BUNNY_STREAM_LIBRARY_ID", "", required=_on_bunny)
BUNNY_STREAM_API_KEY = env("BUNNY_STREAM_API_KEY", "", required=_on_bunny)
BUNNY_STREAM_TOKEN_KEY = env("BUNNY_STREAM_TOKEN_KEY", "", required=_on_bunny)
BUNNY_WEBHOOK_SECRET = env("BUNNY_WEBHOOK_SECRET", "", required=_on_bunny)
if _on_bunny:
    STORAGES = {
        **STORAGES,  # noqa: F405
        "default": {"BACKEND": "files.bunny.BunnyStorage"},
        "public": {
            "BACKEND": "files.bunny.BunnyStorage",
            "OPTIONS": {
                "zone": BUNNY_PUBLIC_STORAGE_ZONE,
                "key": BUNNY_PUBLIC_STORAGE_KEY,
                "base_url": BUNNY_PUBLIC_URL,
            },
        },
    }

FIELD_ENCRYPTION_KEY = env("FIELD_ENCRYPTION_KEY", required=True)
VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY", required=True)
VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY", required=True)
VAPID_SUBJECT = env("VAPID_SUBJECT", "mailto:it@ecst.edu.sd")

# Static files (Django admin, API docs) served by the web process itself.
MIDDLEWARE = [
    MIDDLEWARE[0],  # noqa: F405  SecurityMiddleware first
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[1:],  # noqa: F405
]
STORAGES = {
    **STORAGES,
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# ─── HTTPS hardening ──────────────────────────────────────────────────────
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
AUTH_COOKIE_SECURE = True

LOGGING = {
    **LOGGING,
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json"}},
}


# ─── Error tracking (optional): set SENTRY_DSN to enable ──────────────────
SENTRY_DSN = env("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", "production"),
        release=env("RENDER_GIT_COMMIT", "") or None,
        traces_sample_rate=float(env("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        # Students' and applicants' data never leaves for Sentry.
        send_default_pii=False,
    )
