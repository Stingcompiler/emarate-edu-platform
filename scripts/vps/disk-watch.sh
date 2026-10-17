#!/usr/bin/env bash
# Fails (so ecst-alert@ mails the operators) when the server's disk is nearly full.
# Run by ecst-disk-watch.timer as the `ecst` user; installed as /opt/ecst/bin/disk-watch
# (root-owned, 755). The disk is shared with other projects (their container images and build
# caches are what filled it on 2026-10-17), so the one that fills it takes everything down.
#
#   DISK_ALERT_PERCENT=85 /opt/ecst/bin/disk-watch      # the default threshold
set -euo pipefail
limit="${DISK_ALERT_PERCENT:-85}"
# POSIX df: the same on the server and on a laptop (column 5 = use%, 4 = available).
read -r used free < <(df -Ph / | awk 'NR == 2 { gsub("%", "", $5); print $5, $4 }')
echo "Disk: ${used}% used, ${free} free (alert at ${limit}%)"
if [ "$used" -ge "$limit" ]; then
  echo "DISK NEARLY FULL: ${used}% used, ${free} free. Look at \`docker system df\` first:" \
    "build caches and old images of the other projects are the usual cause." >&2
  exit 1
fi
