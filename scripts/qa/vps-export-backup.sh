#!/usr/bin/env bash
# Decrypt the newest database backup into /tmp/ecst-review.dump for a local rehearsal
# (review 2026-11-10: try the department merges, the migrations and purge_demo on a copy before
# production). Changes nothing on the server but that one file, which the owner deletes after
# copying it. The key is read by the app from /opt/ecst/env as the `ecst` user, never printed.
#
# The owner runs, from the Mac:
#   ssh ovh-prod 'bash -s' < scripts/qa/vps-export-backup.sh
#   mkdir -p -m 700 ~/ecst-restore && scp ovh-prod:/tmp/ecst-review.dump ~/ecst-restore/
#   ssh ovh-prod 'rm -f /tmp/ecst-review.dump'
set -euo pipefail

newest=$(sudo sh -c 'ls -1t /opt/ecst/media/private/backups/ecst-2*.dump.enc | head -1')
name=$(basename "$newest")
echo "Backup: $name"

sudo rm -f /tmp/ecst-review.dump
sudo systemd-run --wait --pipe --quiet -p User=ecst -p EnvironmentFile=/opt/ecst/env \
  -p WorkingDirectory=/opt/ecst/app/backend -p UMask=0077 \
  /opt/ecst/venv/bin/python manage.py restore_database \
  --name "backups/$name" --out /tmp/ecst-review.dump >/dev/null

# Readable by the account that copies it (ubuntu), by nobody else.
sudo chown "$(id -un)" /tmp/ecst-review.dump
sudo chmod 600 /tmp/ecst-review.dump
ls -l /tmp/ecst-review.dump
