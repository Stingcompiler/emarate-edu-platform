#!/usr/bin/env bash
# Deploys main on the server once CI has passed on it (docs/runbook.md §3, "Auto-deploy").
# Run as root by ecst-autodeploy.timer every two minutes; nothing happens while the deployed
# commit is main's. The server only reads the public repository: no key or secret on GitHub
# can reach this machine.
#
#   1. fetch main into /opt/ecst/repo (shallow, as the ecst user);
#   2. ask GitHub for the commit's check runs: wait while any runs, skip the commit if any
#      failed (the next merge brings a new one);
#   3. build everything first, in a throwaway folder: the backend and site archives, and the
#      portal with a throwaway Python environment of that commit (for the API schema);
#   4. only then release (scripts/vps/release.sh of that commit: migrations, health check,
#      the previous release put back if the backend fails), and install this script's new
#      version.
#
# Each commit is tried once: /opt/ecst/deployed/autodeploy records "<commit> <result> <time>".
# A failed build or release exits non-zero, so ecst-alert@ mails the operators; deploy that
# commit by hand (scripts/deploy-vps.sh) or merge a fix. Settings: /opt/ecst/autodeploy.env
# (VITE_SITE_URL, optional GITHUB_REPO); never in this public repository.
#
# Check that a branch builds on the server without releasing or recording anything:
#   sudo AUTODEPLOY_DRY_RUN=1 AUTODEPLOY_REF=<branch> /opt/ecst/bin/autodeploy
set -euo pipefail
exec 9>/run/ecst-autodeploy.lock
flock -n 9 || exit 0 # a run is still going

# shellcheck source=/dev/null
. /opt/ecst/autodeploy.env
: "${VITE_SITE_URL:?Set VITE_SITE_URL in /opt/ecst/autodeploy.env}"
GITHUB_REPO="${GITHUB_REPO:-Stingcompiler/emarate-edu-platform}"
REPO=/opt/ecst/repo
STATE=/opt/ecst/deployed/autodeploy
DRY_RUN="${AUTODEPLOY_DRY_RUN:-}"
REF="${AUTODEPLOY_REF:-main}"
[ "$REF" = main ] || [ -n "$DRY_RUN" ] || { echo "Only main is deployed; use AUTODEPLOY_DRY_RUN=1" >&2; exit 2; }
# The CI jobs that must pass (.github/workflows/ci.yml); keep in step with their names.
REQUIRED='["Backend (sqlite)", "Backend (postgres)", "Frontend (typecheck, build, API client)", "End-to-end (Playwright)"]'

as_ecst() {
  sudo -u ecst env HOME=/opt/ecst COREPACK_HOME=/opt/ecst/.corepack \
    PATH="${work:-/nonexistent}/bin:/opt/ecst/node/bin:/opt/ecst/tools/bin:/usr/bin:/bin" \
    UV_CACHE_DIR=/var/tmp/ecst-uv-cache UV_PYTHON_INSTALL_DIR=/opt/ecst/.uv-python \
    UV_PYTHON_DOWNLOADS=never COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "$@"
}

if [ ! -d "$REPO/.git" ]; then
  install -d -o ecst -g ecst "$REPO"
  as_ecst git clone -q --depth 1 --branch main "https://github.com/$GITHUB_REPO.git" "$REPO"
fi
as_ecst git -C "$REPO" fetch -q --depth 1 origin "$REF"
sha=$(as_ecst git -C "$REPO" rev-parse FETCH_HEAD)

# success | failure | pending: the required CI jobs on that commit.
ci_state() {
  curl -fsS -m 20 -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$GITHUB_REPO/commits/$1/check-runs?per_page=100" |
    python3 -c '
import json, sys
required = set(json.loads(sys.argv[1]))
runs = {r["name"]: r for r in json.load(sys.stdin)["check_runs"]}
if not required <= runs.keys() or any(runs[n]["status"] != "completed" for n in required):
    print("pending")
elif all(runs[n]["conclusion"] == "success" for n in required):
    print("success")
else:
    print("failure")
' "$REQUIRED"
}

if [ -n "$DRY_RUN" ]; then
  echo "Dry run: building ${sha:0:7} ($REF); nothing is released or recorded"
else
  deployed=$(cut -d' ' -f1 /opt/ecst/deployed/backend 2>/dev/null || true)
  [ -n "$deployed" ] && [[ "$sha" == "$deployed"* ]] && exit 0 # main is what runs
  grep -q "^$sha " "$STATE" 2>/dev/null && exit 0                # tried already
  case "$(ci_state "$sha")" in
    success) ;;
    failure)
      echo "$sha ci-failed $(date -Is)" >"$STATE"
      echo "CI failed on main ${sha:0:7}: not deployed"
      exit 0
      ;;
    *) exit 0 ;; # still running (or GitHub unreachable): next time
  esac
fi

[ -n "$DRY_RUN" ] || {
  echo "Auto-deploying main ${sha:0:7} (CI passed)"
  echo "$sha started $(date -Is)" >"$STATE"
}
work=$(mktemp -d /var/tmp/ecst-autodeploy.XXXXXX)
chown ecst:ecst "$work"
trap 'rm -rf "$work"' EXIT
# pnpm comes through corepack here; the build scripts call `pnpm` by name.
install -d -o ecst -g ecst "$work/bin"
printf '#!/bin/sh\nexec corepack pnpm "$@"\n' >"$work/bin/pnpm"
chmod 755 "$work/bin/pnpm"
fail() {
  [ -n "$DRY_RUN" ] || echo "$sha failed $(date -Is) $1" >"$STATE"
  echo "AUTO-DEPLOY FAILED (${sha:0:7}, $1): the running release is unchanged unless said above" >&2
  exit 1
}

# 3. Build everything before touching the live release.
as_ecst git -C "$REPO" archive --format=tar.gz -o "$work/backend.tgz" "$sha" backend scripts ||
  fail "backend archive"
as_ecst git -C "$REPO" archive --format=tar.gz -o "$work/site.tgz" "$sha" \
  apps/landing packages package.json pnpm-lock.yaml pnpm-workspace.yaml || fail "site archive"
as_ecst mkdir "$work/tree"
as_ecst bash -c "git -C '$REPO' archive '$sha' | tar -x -C '$work/tree'" || fail "source tree"
as_ecst uv sync -q --frozen --no-dev --project "$work/tree/backend" ||
  fail "python environment for the API schema"
(
  cd "$work/tree"
  as_ecst pnpm install --frozen-lockfile --silent &&
    as_ecst env API_SCHEMA_PYTHON="$work/tree/backend/.venv/bin/python" \
      DJANGO_SETTINGS_MODULE=config.settings.dev pnpm api:generate >/dev/null &&
    as_ecst env VITE_SITE_URL="$VITE_SITE_URL" pnpm --filter @ecst/portal build >/dev/null
) || fail "portal build"
as_ecst tar -czf "$work/portal.tgz" -C "$work/tree/apps/portal/dist" . || fail "portal archive"

if [ -n "$DRY_RUN" ]; then
  echo "Dry run: ${sha:0:7} builds (backend $(du -h "$work/backend.tgz" | cut -f1), portal $(du -h "$work/portal.tgz" | cut -f1), site $(du -h "$work/site.tgz" | cut -f1))"
  exit 0
fi

# 4. Release (as the manual deploy does) and keep this script current.
install -m 600 "$work/backend.tgz" /tmp/ecst-backend.tgz
install -m 600 "$work/portal.tgz" /tmp/ecst-portal.tgz
install -m 600 "$work/site.tgz" /tmp/ecst-site-src.tgz
bash "$work/tree/scripts/vps/release.sh" all "${sha:0:7}" || fail "release"
install -m 755 "$work/tree/scripts/vps/autodeploy.sh" /opt/ecst/bin/autodeploy
echo "$sha deployed $(date -Is)" >"$STATE"
echo "Auto-deployed main ${sha:0:7}"
