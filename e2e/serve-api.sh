#!/usr/bin/env bash
# API for the end-to-end tests: a fresh SQLite file with the demo data, on :8001 (E2E_API_PORT).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../backend"
export DJANGO_SETTINGS_MODULE=config.settings.e2e
export DEMO_PASSWORD="${DEMO_PASSWORD:-e2e-pass-2026}"
rm -f e2e.sqlite3 e2e.sqlite3-wal e2e.sqlite3-shm
rm -rf sent-emails-e2e
uv run python manage.py migrate --noinput -v 0
uv run python manage.py seed_demo >/dev/null
# The venv's python directly (not `uv run`), so the process Playwright stops at the end is the
# server itself — otherwise an orphaned runserver keeps :8001 busy for the next run.
exec .venv/bin/python manage.py runserver "127.0.0.1:${E2E_API_PORT:-8001}" --noreload
