"""Tests: SQLite in memory by default; PostgreSQL when DATABASE_URL is set.

CI runs the whole suite on both engines (docs/05 §11) to keep the
SQLite ↔ PostgreSQL compatibility rules honest.
"""

import dj_database_url

from .base import *  # noqa: F403
from .base import BASE_DIR, REST_FRAMEWORK, STORAGES
from .env import env

SECRET_KEY = "test-secret-key-only-for-the-test-suite-0123456789"
ALLOWED_HOSTS = ["testserver", "localhost"]

_database_url = env("DATABASE_URL")
DATABASES = {
    "default": dj_database_url.parse(_database_url)
    if _database_url
    else {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
}

CELERY_TASK_ALWAYS_EAGER = True
MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    # Throttling is exercised by dedicated tests, not by every request.
    "DEFAULT_THROTTLE_RATES": {
        scope: "10000/minute"
        for scope in (
            "anon",
            "user",
            "login",
            "otp",
            "otp_ip",
            "contact",
            "contact_status",
            "public_read",
        )
    },
}

SERVE_API_DOCS = True

# Uploaded files stay in memory; the suite never writes into media/ — nor reads it: a backup
# test archived the developer's own uploads (198 MB here, encrypted five bytes at a time), which
# took minutes on a machine with real media and nothing on CI (found 2026-11-13).
MEDIA_ROOT = BASE_DIR / ".test-media"  # never created: backups find no local media
STORAGES = {
    **STORAGES,
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "public": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
}

BACKUP_SCRYPT_LOG_N = 4  # the real factor takes half a second and 128 MB per key
RESTORE_DRAIN_SECONDS = 0  # no requests in flight to wait for
