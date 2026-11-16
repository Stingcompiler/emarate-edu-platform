#!/usr/bin/env bash
# Sets up the copy of every backup off the server, on Cloudflare R2 (owner, 2026-11-16;
# backend/core/offsite.py). Run as root on the server, from a laptop, with a terminal (-t):
#
#   ssh -t <server> 'sudo bash -s -- <cloudflare-account-id> [bucket]' < scripts/vps/set-offsite-backup.sh
#
# It asks for the R2 API token's «Access Key ID» and «Secret Access Key» on the terminal (not
# shown, never in the shell's history or in the repository), writes them to /opt/ecst/env (a copy
# of which is kept first), restarts the API and the worker, and copies the backups once. It
# prints the result, never a key. Run it again to replace the keys.
set -euo pipefail
account="${1:?Cloudflare account id (from the dashboard address)}"
bucket="${2:-ecst-backup}"
[[ "$account" =~ ^[0-9a-f]{32}$ ]] || { echo "that does not look like an account id" >&2; exit 1; }
env_file=/opt/ecst/env

read -r -p "R2 Access Key ID: " key_id </dev/tty
read -r -s -p "R2 Secret Access Key: " secret </dev/tty
echo
[ -n "$key_id" ] && [ -n "$secret" ] || { echo "both keys are needed" >&2; exit 1; }

cp -p "$env_file" "$env_file.bak-$(date +%Y%m%d%H%M%S)"
tmp=$(mktemp "$env_file.XXXXXX")
chmod --reference="$env_file" "$tmp"
chown --reference="$env_file" "$tmp"
grep -v '^OFFSITE_BACKUP_' "$env_file" >"$tmp" || true
{
  echo "OFFSITE_BACKUP_ENDPOINT=https://$account.r2.cloudflarestorage.com"
  echo "OFFSITE_BACKUP_BUCKET=$bucket"
  echo "OFFSITE_BACKUP_ACCESS_KEY_ID=$key_id"
  echo "OFFSITE_BACKUP_SECRET_ACCESS_KEY=$secret"
} >>"$tmp"
mv "$tmp" "$env_file"
unset key_id secret

systemctl restart ecst-api ecst-worker
sudo -u ecst bash -c 'set -a; . /opt/ecst/env; set +a; cd /opt/ecst/app/backend; exec /opt/ecst/venv/bin/python manage.py shell -c "
from core import offsite
try:
    s = offsite.sync()
    print(\"off-server copy: ok —\", s.get(\"copies\"), \"copies, newest\", s.get(\"newest\"), \"(uploaded now:\", s.get(\"uploaded\"), \")\")
except Exception as e:
    print(\"off-server copy FAILED:\", type(e).__name__, str(e)[:200])
"'
