#!/usr/bin/env bash
# Upgrades the platform's own Node (/opt/ecst/node; the system's Node belongs to other projects
# on this shared server and is never touched). Run as root on the server, from a laptop:
#
#   ssh <server> 'sudo bash -s -- <version> <sha256 of node-v<version>-linux-x64.tar.xz>' \
#     < scripts/vps/upgrade-node.sh
#
# The checksum comes from https://nodejs.org/dist/v<version>/SHASUMS256.txt. The tarball is
# refused unless it matches. The Node it replaces stays beside it (/opt/ecst/node-v<old>), so
# going back is two renames (printed at the end). Waits for a deploy or a site build in progress.
set -euo pipefail
version="${1:?version, e.g. 22.23.5}"
sum="${2:?sha256 of node-v$version-linux-x64.tar.xz}"
[ "$(uname -m)" = x86_64 ] || { echo "this script installs the x64 build only" >&2; exit 1; }
current=$(/opt/ecst/node/bin/node --version)
if [ "$current" = "v$version" ]; then echo "already $current"; exit 0; fi

exec 8>/run/ecst-release.lock  # the same lock as release.sh: no deploy meanwhile
flock 8
while systemctl is-active --quiet ecst-site-build.service; do
  echo "a site build is running; waiting"; sleep 10
done

work=$(mktemp -d /opt/ecst/.node-upgrade.XXXXXX)  # same disk as /opt/ecst/node: renames
trap 'rm -rf "$work"' EXIT
curl -fsSL --retry 3 -o "$work/node.tar.xz" \
  "https://nodejs.org/dist/v$version/node-v$version-linux-x64.tar.xz"
echo "$sum  $work/node.tar.xz" | sha256sum -c -
mkdir "$work/node"
tar -xJf "$work/node.tar.xz" -C "$work/node" --strip-components=1
[ "$("$work/node/bin/node" --version)" = "v$version" ]
"$work/node/bin/corepack" --version >/dev/null  # the site build runs pnpm through corepack
chown -R root:root "$work/node"
chmod 755 "$work/node"

kept="/opt/ecst/node-$current"
[ ! -e "$kept" ] || kept="$kept-$(date +%Y%m%d%H%M%S)"
mv /opt/ecst/node "$kept"
mv "$work/node" /opt/ecst/node
echo "node $(/opt/ecst/node/bin/node --version) installed; the previous one is in $kept"
echo "to go back: mv /opt/ecst/node /opt/ecst/node-v$version && mv $kept /opt/ecst/node"
