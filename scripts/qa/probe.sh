#!/usr/bin/env bash
# Run a review's probes the way docs/qa/evidence/review-2026-10-08/README.md describes:
# copy each probe next to the code it needs, run it, save the log, remove the copy.
#
#   bash scripts/qa/probe.sh <evidence-dir> [sqlite|pg|frontend|e2e|all]
#
# Probe files in <evidence-dir> (any that exist are run):
#   backend_probes.py          → backend/core/tests/test_qa_probes_<id>.py   (SQLite; PG with QA_PG_URL)
#   frontend_probes.test.tsx   → the folder named on its first line: // qa-target: apps/portal/src/…
#   e2e_probes.spec.ts         → e2e/tests/qa-probes-<id>.spec.ts
#
# Meaning (same as the past reviews): a probe EXPECTS THE FAULTY BEHAVIOUR.
#   passed  = the defect is reproduced at this commit
#   failed  = not reproduced (or, after a fix, the defect is gone — use /qa-verify)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EV="${1:?usage: probe.sh <evidence-dir> [sqlite|pg|frontend|e2e|all]}"
EV="$(cd "$EV" && pwd)"
WHAT="${2:-all}"
ID="$(basename "$EV" | tr -c 'a-zA-Z0-9\n' '_')"
PY="$ROOT/backend/.venv/bin/python"
[ -x "$PY" ] || PY="uv run --project $ROOT/backend python"
COPIES=()
cleanup() { for f in "${COPIES[@]:-}"; do [ -n "$f" ] && rm -f "$f"; done; }
trap cleanup EXIT

place() { # $1 source, $2 destination — never overwrite a real file
  if [ -e "$2" ]; then
    echo "  → REFUSED: $2 already exists" >&2
    return 1
  fi
  cp "$1" "$2" && COPIES+=("$2")
}

report() { # $1 label, $2 log, $3 exit code
  echo "== $1"
  grep -E "PASSED|FAILED|ERROR|✓|✘|×|[0-9]+ (passed|failed|error)" "$2" | sort -u | head -30
  echo "  (exit $3; passed = defect reproduced) full log: $2"
}

if [ -f "$EV/backend_probes.py" ] && [[ "$WHAT" =~ ^(all|sqlite|pg)$ ]]; then
  dest="$ROOT/backend/core/tests/test_qa_probes_${ID}.py"
  if place "$EV/backend_probes.py" "$dest"; then
    if [[ "$WHAT" =~ ^(all|sqlite)$ ]]; then
      (cd "$ROOT/backend" && $PY -m pytest "$dest" -q -rA -p no:cacheprovider) >"$EV/probes-sqlite.txt" 2>&1
      report "backend probes · SQLite" "$EV/probes-sqlite.txt" $?
    fi
    if [[ "$WHAT" =~ ^(all|pg)$ ]]; then
      if [ -z "${QA_PG_URL:-}" ]; then
        echo "== backend probes · PostgreSQL → SKIPPED (set QA_PG_URL to a local test database)"
      else
        (cd "$ROOT/backend" && DATABASE_URL="$QA_PG_URL" $PY -m pytest "$dest" -q -rA -p no:cacheprovider) \
          >"$EV/probes-postgres.txt" 2>&1
        report "backend probes · PostgreSQL" "$EV/probes-postgres.txt" $?
      fi
    fi
  fi
fi

if [ -f "$EV/frontend_probes.test.tsx" ] && [[ "$WHAT" =~ ^(all|frontend)$ ]]; then
  target="$(head -1 "$EV/frontend_probes.test.tsx" | sed -n 's#^// qa-target: *##p' | tr -d '[:space:]')"
  if [ -z "$target" ] || [ ! -d "$ROOT/$target" ]; then
    echo "== frontend probes → first line must be: // qa-target: apps/portal/src/<folder>" >&2
  else
    dest="$ROOT/$target/qa_${ID}.test.tsx"
    if place "$EV/frontend_probes.test.tsx" "$dest"; then
      (cd "$ROOT" && pnpm --filter @ecst/portal exec vitest run "${dest#"$ROOT"/apps/portal/}") \
        >"$EV/frontend-probes.txt" 2>&1
      report "frontend probes" "$EV/frontend-probes.txt" $?
    fi
  fi
fi

if [ -f "$EV/e2e_probes.spec.ts" ] && [[ "$WHAT" =~ ^(all|e2e)$ ]]; then
  dest="$ROOT/e2e/tests/qa-probes-${ID}.spec.ts"
  if place "$EV/e2e_probes.spec.ts" "$dest"; then
    (cd "$ROOT" && E2E_API_PORT="${E2E_API_PORT:-8011}" E2E_PORTAL_PORT="${E2E_PORTAL_PORT:-5184}" \
      E2E_SITE_PORT="${E2E_SITE_PORT:-4332}" pnpm e2e "e2e/tests/qa-probes-${ID}.spec.ts") \
      >"$EV/e2e-probes.txt" 2>&1
    report "e2e probes" "$EV/e2e-probes.txt" $?
  fi
fi
