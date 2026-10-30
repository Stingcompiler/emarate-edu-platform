#!/usr/bin/env bash
# Restore drill (docs/runbook.md §5): proves the newest backup can really be read back.
#
#   scp scripts/vps/restore-drill.sh "$ECST_SSH":/tmp/ecst-restore-drill.sh
#   ssh "$ECST_SSH" 'sudo -u postgres createdb -O ecst ecst_drill && \
#       sudo systemd-run --wait --pipe --quiet -p User=ecst \
#       -p EnvironmentFile=/opt/ecst/env -p WorkingDirectory=/opt/ecst/app/backend \
#       bash /tmp/ecst-restore-drill.sh; sudo -u postgres dropdb --if-exists ecst_drill; \
#       rm -f /tmp/ecst-restore-drill.sh'
#   # a given backup instead of the newest: … bash /tmp/ecst-restore-drill.sh 20261016T012249Z
#
# Runs as the `ecst` user with the app's environment (the backup key is read from it, never
# printed). It decrypts the database dump and the files archive into a private temporary folder,
# restores the dump into a scratch database `ecst_drill` (never the live one; created empty by
# `postgres` and owned by `ecst`, which may not create databases itself), compares counts
# with the live database, counts the archived files, and removes the scratch database and the
# folder whatever happens. It prints counts and a duration only: no data, no secret.
set -euo pipefail

BACKUPS=/opt/ecst/media/private/backups
PY=/opt/ecst/venv/bin/python
cd /opt/ecst/app/backend

stamp="${1:-}"
if [ -z "$stamp" ]; then
  newest=$(ls -1t "$BACKUPS"/ecst-2*.dump.enc 2>/dev/null | head -1 || true)
  [ -n "$newest" ] || { echo "No database backup found in $BACKUPS" >&2; exit 1; }
  stamp=$(basename "$newest" .dump.enc)
  stamp=${stamp#ecst-}
fi
[ -f "$BACKUPS/ecst-$stamp.dump.enc" ] || { echo "No such backup: ecst-$stamp.dump.enc" >&2; exit 1; }

work=$(mktemp -d /var/tmp/ecst-drill.XXXXXX)
chmod 700 "$work"
cleanup() {
  dropdb --if-exists ecst_drill >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

started=$(date +%s)
echo "Backup: $stamp ($(stat -c %y "$BACKUPS/ecst-$stamp.dump.enc" | cut -d. -f1))"

"$PY" manage.py restore_database --name "backups/ecst-$stamp.dump.enc" --out "$work/ecst.dump" >/dev/null
echo "Database dump decrypted: $(stat -c %s "$work/ecst.dump") bytes"

# The scratch database is made by `postgres` beforehand (the app's role may not create one).
psql -Atqd ecst_drill -c "select 1" >/dev/null 2>&1 || {
  echo "Create the empty scratch database first: sudo -u postgres createdb -O ecst ecst_drill" >&2
  exit 1
}
pg_restore --no-owner --no-privileges --dbname ecst_drill "$work/ecst.dump"
echo "Restored into the scratch database in $(($(date +%s) - started)) s"

count() { psql -Atd "$1" -c "select count(*) from $2"; }
tables() { psql -Atd "$1" -c "select count(*) from information_schema.tables where table_schema = 'public'"; }
printf '%-34s %10s %10s\n' "" "backup" "live"
printf '%-34s %10s %10s\n' "tables" "$(tables ecst_drill)" "$(tables ecst)"
for table in accounts_user students_studentrecord academic_courseoffering admissions_application audit_auditlog; do
  printf '%-34s %10s %10s\n' "$table" "$(count ecst_drill "$table")" "$(count ecst "$table")"
done
echo "(the live counts may be higher: work done after the backup was taken)"

if [ -f "$BACKUPS/ecst-media-$stamp.tar.gz.enc" ]; then
  "$PY" manage.py restore_database --name "backups/ecst-media-$stamp.tar.gz.enc" --out "$work/media.tar.gz" >/dev/null
  files=$(tar -tzf "$work/media.tar.gz" | grep -vc '/$' || true)
  echo "Files archive: $files files, $(stat -c %s "$work/media.tar.gz") bytes (listed, not unpacked)"
else
  echo "No files archive for $stamp"
fi

echo "Drill finished in $(($(date +%s) - started)) s. Scratch database and temporary folder are removed."
