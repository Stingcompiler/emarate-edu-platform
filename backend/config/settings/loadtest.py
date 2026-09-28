"""Local load test (docs/02 Phase 5): production-like process model without HTTPS.

PostgreSQL via DATABASE_URL, DEBUG off, gunicorn workers, throttles relaxed so
the test measures the application rather than the rate limiter. Never deploy.
"""

import dj_database_url

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK
from .env import env

SECRET_KEY = env("DJANGO_SECRET_KEY", "loadtest-only-secret-key-0123456789abcdef")
DEBUG = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
DATABASES = {
    "default": dj_database_url.parse(env("DATABASE_URL", "postgres:///ecst_load"), conn_max_age=60)
}
CELERY_TASK_ALWAYS_EAGER = True
MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # logins are not under test
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        scope: "100000/minute"
        for scope in ("anon", "user", "login", "otp", "otp_ip", "contact", "public_read")
    },
}
LOGGING = {"version": 1, "disable_existing_loggers": False, "root": {"level": "WARNING"}}
