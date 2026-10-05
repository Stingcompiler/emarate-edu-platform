#!/usr/bin/env bash
# Deploys origin/main to a single-server install (docs/runbook.md §3, "VPS") and keeps the
# previous release beside it, so `rollback` brings it back in one step.
#
#   ECST_SSH=user@host scripts/deploy-vps.sh [all|backend|portal|site]
#   ECST_SSH=user@host scripts/deploy-vps.sh rollback [backend|portal|site|all]
#   ECST_SSH=user@host scripts/deploy-vps.sh status
#
# ECST_SSH_KEY picks the key (default: the agent's). VITE_SITE_URL (the public site's address,
# for the portal's links) is required when the portal is deployed. The server address never
# goes in this public repository.
# Layout on the server: /opt/ecst/{app,portal,src} live, /opt/ecst/previous/* the last
# release, /opt/ecst/deployed/<part> the commit each part runs. The backend step syncs the
# Python libraries from uv.lock (with the `prod` extra: gunicorn, psycopg, redis, …),
# restarts, and checks /api/public/health for a 200; if any of that
# fails it puts the previous release back and records nothing (review 2026-10-04, A12/A13).
# Database migrations are not undone by a rollback; a migration that removes data needs a
# restore (runbook §5).
set -euo pipefail

: "${ECST_SSH:?Set ECST_SSH=user@host}"
ACTION="${1:-all}"
PART="${2:-all}"
SSH=(ssh -o BatchMode=yes ${ECST_SSH_KEY:+-i "$ECST_SSH_KEY"} "$ECST_SSH")
SCP=(scp -q -o BatchMode=yes ${ECST_SSH_KEY:+-i "$ECST_SSH_KEY"})
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$ROOT"

# Runs the script on stdin as root on the server; arguments are plain words (no spaces).
remote() { "${SSH[@]}" "sudo -n bash -s -- $*"; }

if [ "$ACTION" = "status" ]; then
  remote <<'R'
for part in backend portal site; do
  printf '%-8s %s\n' "$part" "$(cat /opt/ecst/deployed/$part 2>/dev/null || echo 'not recorded')"
done
systemctl is-active ecst-api ecst-worker | tr '\n' ' '; echo
systemctl list-timers --no-pager ecst-backup.timer ecst-site-build.timer | sed -n '2,3p'
R
  exit 0
fi

if [ "$ACTION" = "rollback" ]; then
  remote "$PART" <<'R'
set -euo pipefail
part="$1"
back() { [ -d "/opt/ecst/previous/$1" ] || { echo "no previous $1"; return 0; }
         rsync -a --delete --exclude media --exclude staticfiles "/opt/ecst/previous/$1/" "/opt/ecst/$1/"
         [ ! -f "/opt/ecst/previous/deployed/$2" ] || cp "/opt/ecst/previous/deployed/$2" "/opt/ecst/deployed/$2"
         echo "$2 rolled back to $(cat /opt/ecst/deployed/$2 2>/dev/null || echo '?')"; }
case "$part" in backend|all)
  back app backend; ln -sfn /opt/ecst/media /opt/ecst/app/backend/media
  UV=$(ls /opt/ecst/tools/bin/uv 2>/dev/null || command -v uv)
  sudo -u ecst env UV_PROJECT_ENVIRONMENT=/opt/ecst/venv UV_CACHE_DIR=/var/tmp/ecst-uv-cache \
    UV_PYTHON_INSTALL_DIR=/opt/ecst/.uv-python UV_PYTHON_DOWNLOADS=never \
    "$UV" sync --frozen --no-dev --extra prod --project /opt/ecst/app/backend -q
  systemctl restart ecst-api ecst-worker;; esac
case "$part" in portal|all) back portal portal;; esac
case "$part" in site|all) back src site; systemctl start ecst-site-build.service;; esac
R
  exit 0
fi

case "$ACTION" in all|backend|portal|site) ;; *) echo "unknown action: $ACTION" >&2; exit 2;; esac

git fetch -q origin
SHA="$(git rev-parse --short origin/main)"
echo "Deploying origin/main ($SHA): $ACTION"

if [ "$ACTION" = all ] || [ "$ACTION" = backend ]; then
  git archive --format=tar.gz -o "$TMP/backend.tgz" origin/main backend scripts
  "${SCP[@]}" "$TMP/backend.tgz" "$ECST_SSH:/tmp/ecst-backend.tgz"
fi
if [ "$ACTION" = all ] || [ "$ACTION" = site ]; then
  git archive --format=tar.gz -o "$TMP/site.tgz" origin/main \
    apps/landing packages package.json pnpm-lock.yaml pnpm-workspace.yaml
  "${SCP[@]}" "$TMP/site.tgz" "$ECST_SSH:/tmp/ecst-site-src.tgz"
fi
if [ "$ACTION" = all ] || [ "$ACTION" = portal ]; then
  : "${VITE_SITE_URL:?Set VITE_SITE_URL (the public site, e.g. https://example.org/ar/) for the portal build}"
  # Build exactly origin/main, not the working tree.
  git worktree add -q --detach "$TMP/tree" origin/main
  (cd "$TMP/tree" && pnpm install --frozen-lockfile --silent && pnpm api:generate >/dev/null \
    && VITE_SITE_URL="$VITE_SITE_URL" pnpm --filter @ecst/portal build >/dev/null)
  COPYFILE_DISABLE=1 tar -czf "$TMP/portal.tgz" -C "$TMP/tree/apps/portal/dist" .
  git worktree remove --force "$TMP/tree"
  "${SCP[@]}" "$TMP/portal.tgz" "$ECST_SSH:/tmp/ecst-portal.tgz"
fi

remote "$ACTION" "$SHA" <<'R'
set -euo pipefail
action="$1"; sha="$2"
mkdir -p /opt/ecst/previous/deployed /opt/ecst/deployed
keep() { [ ! -d "/opt/ecst/$1" ] || rsync -a --delete --exclude media --exclude staticfiles \
           "/opt/ecst/$1/" "/opt/ecst/previous/$1/"
         [ ! -f "/opt/ecst/deployed/$2" ] || cp "/opt/ecst/deployed/$2" "/opt/ecst/previous/deployed/$2"; }
mark() { echo "$sha $(date -Is)" > "/opt/ecst/deployed/$1"; }
unpack() { rm -rf "/tmp/ecst-$1" && mkdir "/tmp/ecst-$1" && tar -xzf "/tmp/ecst-$1.tgz" -C "/tmp/ecst-$1" 2>/dev/null && rm -f "/tmp/ecst-$1.tgz"; }
run() { sudo -u ecst bash -c 'set -a; . /opt/ecst/env; set +a; cd /opt/ecst/app/backend; exec /opt/ecst/venv/bin/python manage.py "$@"' _ "$@"; }
# The install keeps its own uv and Python under /opt/ecst (never another project's copy).
UV=$(ls /opt/ecst/tools/bin/uv 2>/dev/null || command -v uv || true)
sync_libraries() {
  [ -n "$UV" ] || { echo "uv not found on the server"; return 1; }
  sudo -u ecst env UV_PROJECT_ENVIRONMENT=/opt/ecst/venv UV_CACHE_DIR=/var/tmp/ecst-uv-cache \
    UV_PYTHON_INSTALL_DIR=/opt/ecst/.uv-python UV_PYTHON_DOWNLOADS=never \
    "$UV" sync --frozen --no-dev --extra prod --project /opt/ecst/app/backend -q
}
healthy() {
  # The API answers only to its own host names (DJANGO_ALLOWED_HOSTS).
  local host
  host=$(grep '^DJANGO_ALLOWED_HOSTS=' /opt/ecst/env | cut -d= -f2- | tr -d '"' | cut -d, -f1)
  for _ in $(seq 1 20); do
    # As Caddy sends it (HTTPS), or Django answers 301 and a redirect is not "healthy".
    [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Host: $host" \
      -H 'X-Forwarded-Proto: https' http://127.0.0.1:8100/api/public/health)" = 200 ] && return 0
    sleep 2
  done
  return 1
}
restore_backend() {
  echo "BACKEND DEPLOY FAILED ($1): putting the previous release back" >&2
  rsync -a --delete --exclude media --exclude staticfiles /opt/ecst/previous/app/ /opt/ecst/app/
  ln -sfn /opt/ecst/media /opt/ecst/app/backend/media && chown -R ecst:ecst /opt/ecst/app
  sync_libraries || true
  systemctl restart ecst-api ecst-worker
  healthy && echo "previous release is serving again" >&2 || echo "PREVIOUS RELEASE ALSO UNHEALTHY" >&2
  exit 1
}

if [ "$action" = all ] || [ "$action" = backend ]; then
  keep app backend; unpack backend
  rsync -a --delete --exclude media --exclude staticfiles --exclude __pycache__ /tmp/ecst-backend/ /opt/ecst/app/
  rm -rf /tmp/ecst-backend
  ln -sfn /opt/ecst/media /opt/ecst/app/backend/media && chown -R ecst:ecst /opt/ecst/app
  sync_libraries || restore_backend "uv sync"
  run migrate --noinput | tail -1 || restore_backend "migrate"
  run collectstatic --noinput | tail -1 || restore_backend "collectstatic"
  systemctl restart ecst-api ecst-worker
  healthy || restore_backend "health check"
  echo "services: $(systemctl is-active ecst-api ecst-worker | tr '\n' ' ')"
  mark backend
fi
if [ "$action" = all ] || [ "$action" = portal ]; then
  keep portal portal; unpack portal
  rsync -a --delete-after /tmp/ecst-portal/ /opt/ecst/portal/ && rm -rf /tmp/ecst-portal
  chown -R ecst:ecst /opt/ecst/portal && echo "portal deployed"
  mark portal
fi
if [ "$action" = all ] || [ "$action" = site ]; then
  keep src site; unpack site-src
  rsync -a --delete --exclude node_modules --exclude dist /tmp/ecst-site-src/ /opt/ecst/src/
  rm -rf /tmp/ecst-site-src && chown -R ecst:ecst /opt/ecst/src
  # The build service publishes only a successful build; record the site only then.
  if systemctl start ecst-site-build.service; then
    journalctl -u ecst-site-build --since -3min --no-pager -o cat | grep -E "site published" | tail -1
    mark site
  else
    echo "SITE BUILD FAILED: the published site is unchanged" >&2; exit 1
  fi
fi
for part in backend portal site; do
  printf '%-8s %s\n' "$part" "$(cat /opt/ecst/deployed/$part 2>/dev/null || echo 'not recorded')"
done
R
