#!/usr/bin/env bash
# Inventory of the version under review (review plan 2026-11-10): the coverage registers for
# the public site, the portal and the backend, generated from the code. No AI, no server.
#   bash scripts/qa/inventory.sh docs/qa/evidence/<review>/inventory
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:?usage: inventory.sh <out-dir>}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
WORK="$(mktemp -d)"
COPY="$ROOT/apps/portal/src/lib/zz_register.test.ts"
trap 'rm -rf "$WORK" "$COPY"' EXIT

(cd "$ROOT" && pnpm api:generate >/dev/null)
(cd "$ROOT/backend" && PYTHONPATH=. DJANGO_SETTINGS_MODULE=config.settings.test \
  uv run python "$ROOT/scripts/qa/inventory/collect.py" "$WORK" \
  "$ROOT/packages/api/src/generated/openapi.json")
cp "$ROOT/scripts/qa/inventory/register.test.ts" "$COPY"
(cd "$ROOT/apps/portal" && REGISTER_ME="$WORK/me.json" REGISTER_OUT="$WORK/portal.json" \
  pnpm exec vitest run src/lib/zz_register.test.ts >/dev/null)
python3 "$ROOT/scripts/qa/inventory/build.py" "$WORK" "$OUT"
(cd "$ROOT" && pnpm exec prettier --write "$OUT/README.md" >/dev/null)
