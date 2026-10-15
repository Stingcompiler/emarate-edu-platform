#!/usr/bin/env bash
# Run QA checks and keep the full logs out of the AI's context (docs/qa/QA-SYSTEM.md).
#
#   bash scripts/qa/run.sh <evidence-dir> <suite> [<suite> …]
#
# Every suite writes its whole log to <evidence-dir>/<suite>.txt and prints only a short
# summary (counts + failing test names, at most 25 lines). Agents read the log file only
# when the summary is not enough, and then only the part they need.
#
# Suites:
#   lint            ruff check + format check (backend, scripts) and prettier
#   migrations      makemigrations --check
#   openapi         spectacular --fail-on-warn --validate
#   typecheck       pnpm typecheck
#   backend-sqlite  pytest on SQLite        (QA_PYTEST="accounts/tests core/tests" to narrow)
#   backend-pg      pytest on PostgreSQL    (needs QA_PG_URL; never the production database)
#   frontend        vitest (pnpm test)
#   e2e             Playwright on phone + desktop (QA_E2E="exam.spec.ts sign-in.spec.ts")
#   audit           pnpm audit --prod
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:?usage: run.sh <evidence-dir> <suite>…}"
shift
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
PY="$ROOT/backend/.venv/bin/python"
[ -x "$PY" ] || PY="uv run --project $ROOT/backend python"

summary() { # $1 = log file, $2 = exit code
  local log="$1" code="$2"
  {
    grep -E "^(FAILED|ERROR) |[0-9]+ (passed|failed|error)|Tests? +[0-9]+ (passed|failed)|✘|[0-9]+ (passed|failed|flaky|skipped)|error TS[0-9]+|would reformat|Found [0-9]+ error|No changes detected|Changes detected|vulnerabilit" "$log" |
      grep -vE "^\s*$" | sort -u | head -25
  } || true
  if [ "$code" -eq 0 ]; then echo "  → OK"; else echo "  → FAILED (exit $code) — full log: $log"; fi
}

run() { # $1 = suite name, rest = command run in $ROOT
  local name="$1" log="$OUT/$1.txt" started code
  shift
  started=$(date +%s)
  echo "== $name"
  (cd "$ROOT" && eval "$@") >"$log" 2>&1
  code=$?
  echo "# exit $code, $(($(date +%s) - started))s, $(date -u +%FT%TZ)" >>"$log"
  summary "$log" "$code"
}

for suite in "$@"; do
  case "$suite" in
  lint)
    run lint "cd backend && $PY -m ruff check . ../scripts && $PY -m ruff format --check . ../scripts && cd .. && pnpm format:check"
    ;;
  migrations) run migrations "cd backend && $PY manage.py makemigrations --check --dry-run" ;;
  openapi) run openapi "cd backend && $PY manage.py spectacular --fail-on-warn --validate --file /dev/null" ;;
  typecheck) run typecheck "pnpm typecheck" ;;
  backend-sqlite) run backend-sqlite "cd backend && $PY -m pytest -q -W error::DeprecationWarning ${QA_PYTEST:-}" ;;
  backend-pg)
    if [ -z "${QA_PG_URL:-}" ]; then
      echo "== backend-pg"
      echo "  → SKIPPED: set QA_PG_URL to a local test PostgreSQL (never production)"
      continue
    fi
    case "$QA_PG_URL" in *stingdev* | *prod*)
      echo "== backend-pg"
      echo "  → REFUSED: QA_PG_URL looks like production"
      continue
      ;;
    esac
    run backend-pg "cd backend && DATABASE_URL='$QA_PG_URL' $PY -m pytest -q -W error::DeprecationWarning ${QA_PYTEST:-}"
    ;;
  frontend) run frontend "pnpm test" ;;
  e2e)
    specs=""
    for spec in ${QA_E2E:-}; do specs="$specs e2e/tests/$spec"; done
    run e2e "E2E_API_PORT=\${E2E_API_PORT:-8011} E2E_PORTAL_PORT=\${E2E_PORTAL_PORT:-5184} E2E_SITE_PORT=\${E2E_SITE_PORT:-4332} pnpm e2e $specs"
    ;;
  audit) run audit "pnpm audit --prod" ;;
  *) echo "unknown suite: $suite" >&2 ;;
  esac
done
