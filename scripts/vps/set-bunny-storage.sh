#!/usr/bin/env bash
# Moves every uploaded file to Bunny (owner, 2026-11-16: «ننقل التخزين إلى bunny، كل الملفات
# كتخزين دائم»; backend/files/move.py). Run as root on the server, with a terminal — it asks for
# the keys, so the script is copied there first (piped in, it would take the terminal's place):
#
#   scp scripts/vps/set-bunny-storage.sh <server>:/tmp/
#   ssh -t <server> 'sudo bash /tmp/set-bunny-storage.sh'
#
# In order, stopping at the first thing that fails (the platform then stays on the server's disk,
# as it was):
#   1. asks for the two zones and their pull zones (keys not shown on the screen, never in the
#      shell's history or the repository) and writes them to /opt/ecst/env (a copy of which is
#      kept first) — MEDIA_BACKEND stays local. The videos are files in the private zone, like the
#      rest (owner, 2026-11-16: «الفيديوهات تبقى على bunny storage»): no Bunny Stream;
#   2. checks both zones end to end (manage.py check_bunny_storage);
#   3. copies the server's files there (manage.py move_files_to_bunny), then checks they all are;
#   4. switches MEDIA_BACKEND=bunny, restarts the API and the worker, checks the API answers;
#   5. copies once more what was uploaded meanwhile, and rebuilds the site (its image addresses
#      change).
# The files stay on the server's disk too, untouched: going back is MEDIA_BACKEND=local and a
# restart (what was uploaded to Bunny since is then on Bunny only). The backups stay on the server.
set -euo pipefail
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

# Each question is asked again until its answer fits it (a wrong field is the usual slip).
ask() {  # $1 prompt, $2 pattern
  local value
  while true; do
    read -r -p "$1: " value
    value="${value// /}"
    [[ "$value" =~ $2 ]] && { printf '%s' "$value"; return; }
    echo "   that does not fit «$1» — try again" >&2
  done
}
secret() {
  local value
  while true; do
    read -r -s -p "$1: " value
    echo >&2
    [ -n "$value" ] && { printf '%s' "$value"; return; }
    echo "   empty — try again" >&2
  done
}
address() {  # a pull zone's address; https:// is added when left out
  local value
  while true; do
    read -r -p "$1: " value
    value="${value// /}"
    value="${value%/}"
    [[ "$value" =~ ^https?:// ]] || value="https://$value"
    value="https://${value#*://}"
    [[ "$value" =~ ^https://[A-Za-z0-9.-]+\.[a-z]{2,}$ ]] && { printf '%s' "$value"; return; }
    echo "   an address like ecst-files.b-cdn.net — try again" >&2
  done
}
zone='^[a-z0-9][a-z0-9-]*$'

echo "— Private storage zone (submissions, documents, lecture files) —"
private_zone=$(ask "Storage zone name (= the Username on FTP & API Access)" "$zone")
private_key=$(secret "Storage zone password (FTP & API Access → Password)")
pull_url=$(address "Its pull zone address (….b-cdn.net)")
token_key=$(secret "Its pull zone's Token Authentication key (Security → Token Authentication)")
echo "— Public storage zone (site images, photos, the logo) —"
public_zone=$(ask "Storage zone name (= the Username on FTP & API Access)" "$zone")
public_key=$(secret "Storage zone password")
public_url=$(address "Its pull zone address (….b-cdn.net)")

cp -p "$env_file" "$env_file.bak-$(date +%Y%m%d%H%M%S)"
write_env() {  # $1: MEDIA_BACKEND
  local tmp
  tmp=$(mktemp "$env_file.XXXXXX")
  chmod --reference="$env_file" "$tmp"
  chown --reference="$env_file" "$tmp"
  # Only the lines written below: any other BUNNY_ setting (Stream, the storage host) stays.
  grep -v -E '^(MEDIA_BACKEND|BUNNY_(STORAGE_ZONE|STORAGE_KEY|PULL_ZONE_URL|TOKEN_KEY|PUBLIC_STORAGE_ZONE|PUBLIC_STORAGE_KEY|PUBLIC_URL))=' \
    "$env_file" >"$tmp" || true
  {
    echo "MEDIA_BACKEND=$1"
    echo "BUNNY_STORAGE_ZONE=$private_zone"
    echo "BUNNY_STORAGE_KEY=$private_key"
    echo "BUNNY_PULL_ZONE_URL=$pull_url"
    echo "BUNNY_TOKEN_KEY=$token_key"
    echo "BUNNY_PUBLIC_STORAGE_ZONE=$public_zone"
    echo "BUNNY_PUBLIC_STORAGE_KEY=$public_key"
    echo "BUNNY_PUBLIC_URL=$public_url"
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
unset private_key token_key public_key
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
echo "Bunny storage: on — every file, the videos too. The files also stay on the server's disk until you remove them."
