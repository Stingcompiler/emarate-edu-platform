#!/usr/bin/env bash
# Moves every uploaded file to Bunny (owner, 2026-11-16: «ننقل التخزين إلى bunny، كل الملفات
# كتخزين دائم»; backend/files/move.py). Run as root on the server, with a terminal — it asks for
# the keys, so the script is copied there first (piped in, it would take the terminal's place):
#
#   scp scripts/vps/set-bunny-storage.sh <server>:/tmp/
#   ssh -t <server> 'sudo bash /tmp/set-bunny-storage.sh [portal-address]; rm -f /tmp/set-bunny-storage.sh'
#
# In order, stopping at the first thing that fails (the platform then stays on the server's disk,
# as it was):
#   1. asks for the two zones, their pull zones and Bunny Stream (keys not shown on the screen,
#      never in the shell's history or the repository) and writes them to /opt/ecst/env (a copy of
#      which is kept first) — MEDIA_BACKEND stays local;
#   2. checks both zones end to end (manage.py check_bunny_storage);
#   3. copies the server's files there (manage.py move_files_to_bunny), then checks they all are;
#   4. switches MEDIA_BACKEND=bunny, restarts the API and the worker, checks the API answers;
#   5. copies once more what was uploaded meanwhile, and rebuilds the site (its image addresses
#      change);
#   6. shows once the Bunny Stream webhook address to paste into the video library, then clears it.
# The files stay on the server's disk too, untouched: going back is MEDIA_BACKEND=local and a
# restart (what was uploaded to Bunny since is then on Bunny only). The backups stay on the server.
set -euo pipefail
portal="${1:-https://portal.ecst.stingdev.pro}"
[[ "$portal" =~ ^https://[a-z0-9.-]+$ ]] || { echo "the portal's address, like https://portal.example.org" >&2; exit 1; }
env_file=/opt/ecst/env
manage() {
  sudo -u ecst bash -c 'set -a; . /opt/ecst/env; set +a; cd /opt/ecst/app/backend; exec /opt/ecst/venv/bin/python manage.py "$@"' _ "$@"
}

[ -t 0 ] || { echo "run it with a terminal (ssh -t, the script copied first); nothing was changed" >&2; exit 1; }
manage help move_files_to_bunny >/dev/null 2>&1 \
  || { echo "the platform's release that moves files to Bunny is not installed yet; nothing was changed" >&2; exit 1; }
if grep -q '^MEDIA_BACKEND=bunny' "$env_file"; then
  echo "the files are already on Bunny (MEDIA_BACKEND=bunny); nothing was changed" >&2
  exit 1
fi

ask() { local value; read -r -p "$1: " value; [ -n "$value" ] || { echo "needed: $1" >&2; exit 1; }; printf '%s' "$value"; }
secret() { local value; read -r -s -p "$1: " value; echo >&2; [ -n "$value" ] || { echo "needed: $1" >&2; exit 1; }; printf '%s' "$value"; }
address() { [[ "$1" =~ ^https://[A-Za-z0-9.-]+/?$ ]] || { echo "an address like https://name.b-cdn.net: $1" >&2; exit 1; }; printf '%s' "${1%/}"; }

echo "— Private storage zone (submissions, documents, lecture files) —"
private_zone=$(ask "Storage zone name")
private_key=$(secret "Storage zone password (FTP & API Access → Password)")
pull_url=$(address "$(ask "Its pull zone address (https://….b-cdn.net)")")
token_key=$(secret "Its pull zone's Token Authentication key (Security → Token Authentication)")
echo "— Public storage zone (site images, photos, the logo) —"
public_zone=$(ask "Storage zone name")
public_key=$(secret "Storage zone password")
public_url=$(address "$(ask "Its pull zone address (https://….b-cdn.net)")")
echo "— Bunny Stream (lecture videos) —"
library=$(ask "Video library ID")
[[ "$library" =~ ^[0-9]+$ ]] || { echo "the library ID is a number" >&2; exit 1; }
stream_key=$(secret "Library API key (API → API Key)")
stream_token=$(secret "Library token authentication key (Security → Token authentication key)")
hook_secret=$(openssl rand -hex 24)

cp -p "$env_file" "$env_file.bak-$(date +%Y%m%d%H%M%S)"
write_env() {  # $1: MEDIA_BACKEND
  local tmp
  tmp=$(mktemp "$env_file.XXXXXX")
  chmod --reference="$env_file" "$tmp"
  chown --reference="$env_file" "$tmp"
  grep -v -e '^BUNNY_' -e '^MEDIA_BACKEND=' "$env_file" >"$tmp" || true
  {
    echo "MEDIA_BACKEND=$1"
    echo "BUNNY_STORAGE_ZONE=$private_zone"
    echo "BUNNY_STORAGE_KEY=$private_key"
    echo "BUNNY_PULL_ZONE_URL=$pull_url"
    echo "BUNNY_TOKEN_KEY=$token_key"
    echo "BUNNY_PUBLIC_STORAGE_ZONE=$public_zone"
    echo "BUNNY_PUBLIC_STORAGE_KEY=$public_key"
    echo "BUNNY_PUBLIC_URL=$public_url"
    echo "BUNNY_STREAM_LIBRARY_ID=$library"
    echo "BUNNY_STREAM_API_KEY=$stream_key"
    echo "BUNNY_STREAM_TOKEN_KEY=$stream_token"
    echo "BUNNY_WEBHOOK_SECRET=$hook_secret"
  } >>"$tmp"
  mv "$tmp" "$env_file"
}
write_env local
echo "1/5 keys saved (the files are still on the server's disk)"

manage check_bunny_storage || { echo "the Bunny setup does not work yet — nothing moved; fix it and run this again" >&2; exit 1; }
echo "2/5 both zones work"

manage move_files_to_bunny || { echo "not every file reached Bunny — nothing switched; run this again" >&2; exit 1; }
echo "3/5 the files are on Bunny"

write_env bunny
unset private_key token_key public_key stream_key stream_token
systemctl restart ecst-api ecst-worker
host=$(grep '^DJANGO_ALLOWED_HOSTS=' "$env_file" | cut -d= -f2- | tr -d '"' | cut -d, -f1)
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Host: $host" -H 'X-Forwarded-Proto: https' \
    http://127.0.0.1:8100/api/public/health || true)
  [ "$code" = 200 ] && break
  sleep 2
done
if [ "$code" != 200 ]; then
  sed -i 's/^MEDIA_BACKEND=bunny$/MEDIA_BACKEND=local/' "$env_file"
  systemctl restart ecst-api ecst-worker
  echo "the API did not answer on Bunny (HTTP $code): back on the server's disk, as before" >&2
  exit 1
fi
echo "4/5 the platform runs on Bunny"

manage move_files_to_bunny || echo "warning: run «manage.py move_files_to_bunny» again for the files uploaded during the switch" >&2
touch /opt/ecst/rebuild.flag
echo "5/5 done; the site is being rebuilt with the images' new addresses"

echo
echo "Last step, in Bunny: Stream → the library → Webhook URL — paste this address:"
echo "  $portal/api/public/webhooks/bunny-stream?secret=$hook_secret"
unset hook_secret
read -r -p "Press Enter once it is pasted (the address is then cleared from the screen) " _
printf '\033[3J\033[H\033[2J'
echo "Bunny storage: on. The files also stay on the server's disk until you remove them."
