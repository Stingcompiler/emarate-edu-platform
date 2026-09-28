"""End-to-end tests (Playwright, docs/05 §11): the dev stack on its own database and ports.

A throwaway SQLite file seeded with the demo data; the portal runs on :5174 and the API on
:8001 so a developer's running `pnpm dev` is never touched. Never deploy.
"""

from .dev import *  # noqa: F403
from .dev import BASE_DIR, DATABASES, REST_FRAMEWORK
from .env import env

DATABASES = {
    "default": {**DATABASES["default"], "NAME": env("E2E_DB", str(BASE_DIR / "e2e.sqlite3"))}
}
CSRF_TRUSTED_ORIGINS = ["http://localhost:5174", "http://127.0.0.1:5174"]
PUBLIC_SITE_ORIGINS = ["http://localhost:4322", "http://127.0.0.1:4322"]
MAILERS = {
    "default": {
        "BACKEND": "core.mail.DevEmailBackend",
        "OPTIONS": {"file_path": env("E2E_MAIL_DIR", str(BASE_DIR / "sent-emails-e2e"))},
    }
}
# Tests sign in and request codes far more often than a person does.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        scope: "100000/minute" for scope in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    },
}
