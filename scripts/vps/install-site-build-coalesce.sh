#!/usr/bin/env bash
# A rebuild the CMS asks for while the site is being built is not lost any more (2026-11-15).
#
# The portal asks by touching /opt/ecst/rebuild.flag (ecst-rebuild-hook), and
# ecst-site-build.path starts ecst-site-build.service. A request that arrives while that
# service is already running is merged into it, but the build read the API when it began:
# the change waited for the six-hourly build (a staff photo turned on during a deploy's build).
# This puts a wrapper in front of /opt/ecst/bin/build-site (left as it is, with its settings)
# that builds again when the flag changed during the build. Run as root on the server:
#
#   ssh <server> 'sudo bash -s' < scripts/vps/install-site-build-coalesce.sh
#
# Undo: rm /etc/systemd/system/ecst-site-build.service.d/20-coalesce.conf && systemctl daemon-reload
set -euo pipefail
cat > /opt/ecst/bin/build-site-coalesce.new <<'WRAPPER'
#!/bin/bash
# Builds the site; again while the CMS asked for a rebuild during the build (five rounds at most:
# the next request or the six-hourly build catches up after that).
set -euo pipefail
flag=/opt/ecst/rebuild.flag
for round in 1 2 3 4 5; do
  before=$(stat -c %y "$flag" 2>/dev/null || echo none)
  /opt/ecst/bin/build-site
  after=$(stat -c %y "$flag" 2>/dev/null || echo none)
  [ "$after" = "$before" ] && exit 0
  echo "a rebuild was asked during the build ($after): building again"
done
echo "rebuilds still asked after 5 rounds; the next request or the 6-hourly build will follow"
WRAPPER
chown root:root /opt/ecst/bin/build-site-coalesce.new
chmod 755 /opt/ecst/bin/build-site-coalesce.new
mv /opt/ecst/bin/build-site-coalesce.new /opt/ecst/bin/build-site-coalesce
mkdir -p /etc/systemd/system/ecst-site-build.service.d
cat > /etc/systemd/system/ecst-site-build.service.d/20-coalesce.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=/opt/ecst/bin/build-site-coalesce
UNIT
systemctl daemon-reload
systemctl show -p ExecStart ecst-site-build.service | grep -q build-site-coalesce
echo "ecst-site-build now runs /opt/ecst/bin/build-site-coalesce"
