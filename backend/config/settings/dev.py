"""Development: runs with zero external services (docs/02 D2, docs/05 §4).

SQLite file database, Celery tasks inline, emails to the console and a file,
in-memory cache, media on the local disk.
"""

from .base import *  # noqa: F403
from .base import BASE_DIR, REST_FRAMEWORK
from .env import env, env_list

DEBUG = True
SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-insecure-key-do-not-use-in-production")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1", "[::1]"])
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", ["http://localhost:5173", "http://127.0.0.1:5173"]
)

PUBLIC_SITE_ORIGINS = env_list(
    "PUBLIC_SITE_ORIGINS", ["http://localhost:4321", "http://127.0.0.1:4321"]
)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        "OPTIONS": {
            # WAL lets the dev server read while a long import writes.
            # Django already enables foreign_keys on every SQLite connection.
            "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
            "transaction_mode": "IMMEDIATE",
        },
    }
}

CELERY_TASK_ALWAYS_EAGER = True

MAILERS = {
    "default": {
        "BACKEND": "core.mail.DevEmailBackend",
        "OPTIONS": {"file_path": str(BASE_DIR / "sent-emails")},
    }
}

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

SERVE_API_DOCS = True
