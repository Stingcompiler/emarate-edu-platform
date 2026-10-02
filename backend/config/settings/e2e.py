"""End-to-end tests (Playwright, docs/05 §11): the dev stack on its own database and ports.

A throwaway SQLite file seeded with the demo data; the portal runs on :5174 and the API on
:8001 so a developer's running `pnpm dev` is never touched. Never deploy.
"""

from .dev import *  # noqa: F403
from .dev import BASE_DIR, DATABASES, REST_FRAMEWORK, STORAGES
from .env import env

DATABASES = {
    "default": {**DATABASES["default"], "NAME": env("E2E_DB", str(BASE_DIR / "e2e.sqlite3"))}
}
# Ports follow e2e/playwright.config.ts (E2E_*_PORT), so a busy default can move.
_API = env("E2E_API_PORT", "8001")
_PORTAL = env("E2E_PORTAL_PORT", "5174")
_SITE = env("E2E_SITE_PORT", "4322")
CSRF_TRUSTED_ORIGINS = [f"http://localhost:{_PORTAL}", f"http://127.0.0.1:{_PORTAL}"]
PUBLIC_SITE_ORIGINS = [f"http://localhost:{_SITE}", f"http://127.0.0.1:{_SITE}"]
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

# The test API serves the public media on its own port (see dev.py).
STORAGES = {
    **STORAGES,
    "public": {
        **STORAGES["public"],
        "OPTIONS": {
            **STORAGES["public"]["OPTIONS"],
            "base_url": f"http://127.0.0.1:{_API}/media/public/",
        },
    },
}
