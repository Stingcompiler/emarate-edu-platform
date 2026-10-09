#!/usr/bin/env bash
# Installs the release waiting in /tmp (ecst-backend.tgz, ecst-portal.tgz, ecst-site-src.tgz)
# and records it. Run as root on the server, by scripts/deploy-vps.sh (from a laptop) and by
# scripts/vps/autodeploy.sh (on the server, after CI passes on main):
#
#   release.sh all|backend|portal|site <commit>
#
# The previous release is kept beside the live one (/opt/ecst/previous) so a failed backend
# step puts it back, and `deploy-vps.sh rollback` can bring it back later. One release at a
# time: a manual deploy and the auto-deploy wait for each other.
exec 8>/run/ecst-release.lock
flock 8
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
