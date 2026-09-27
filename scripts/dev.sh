#!/usr/bin/env bash
# Run the whole platform locally with zero external services (docs/02 D2):
#   API      http://127.0.0.1:8000   (Django, SQLite, Celery inline, console email)
#   Portal   http://localhost:5173    (React PWA, proxies /api to Django)
#   Landing  http://localhost:4321    (Astro public site)
#
# Usage: scripts/dev.sh [--api-only]
# Needs: uv (Python) and pnpm (Node). Nothing else — no Docker, no database server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_ONLY=false
[[ "${1:-}" == "--api-only" ]] && API_ONLY=true

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ '$1' is required: $2" >&2; exit 1; }
}
require uv "https://docs.astral.sh/uv/"
$API_ONLY || require pnpm "https://pnpm.io/installation"

echo "▸ Backend: installing dependencies and applying migrations (SQLite)…"
uv sync --project backend --quiet
uv run --project backend python backend/manage.py migrate --noinput -v 0

if ! $API_ONLY; then
  echo "▸ Frontend: installing dependencies and generating the API client…"
  pnpm install --silent
  pnpm api:generate >/dev/null
fi

pids=()
# Stop a process and everything it started. Each service runs as
# `uv run → runserver → reloader child` or `pnpm → node`, so killing only the
# top pid would leave the real server listening on its port.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  trap - INT TERM HUP EXIT
  for pid in "${pids[@]}"; do kill_tree "$pid"; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM HUP EXIT

# Prefix each service's output so the combined log stays readable.
run() {
  local name=$1; shift
  ( "$@" 2>&1 | sed -u "s/^/[$name] /" ) &
  pids+=($!)
}

run api uv run --project backend python backend/manage.py runserver 127.0.0.1:8000
if ! $API_ONLY; then
  run portal pnpm --filter @ecst/portal dev
  run landing pnpm --filter @ecst/landing dev
fi

cat <<EOF

  API      http://127.0.0.1:8000/api/public/health   (docs: /api/docs/)
EOF
$API_ONLY || cat <<EOF
  Portal   http://localhost:5173
  Landing  http://localhost:4321
EOF
echo "  Ctrl+C stops everything."
echo

wait
