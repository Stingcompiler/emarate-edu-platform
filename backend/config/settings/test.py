"""Tests: SQLite in memory by default; PostgreSQL when DATABASE_URL is set.

CI runs the whole suite on both engines (docs/05 §11) to keep the
SQLite ↔ PostgreSQL compatibility rules honest.
"""

import dj_database_url

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK
from .env import env

SECRET_KEY = "test-secret-key"
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
    "DEFAULT_THROTTLE_RATES": {"anon": "10000/minute", "user": "10000/minute"},
}

SERVE_API_DOCS = True
