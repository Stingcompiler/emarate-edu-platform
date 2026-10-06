#!/usr/bin/env bash
# Runs every 5 minutes on the server as the ecst user (ecst-healthcheck.timer, runbook §7).
# Checks the API the way Caddy reaches it and that the API and worker units are up. On a
# failure it calls `manage.py notify_ops`; when Django itself cannot start (the 2026-10-04
# outage: libraries removed from the venv) it sends the mail directly over SMTP with curl,
# to OPS_ALERT_EMAIL, using the SMTP settings in /opt/ecst/env.
set -uo pipefail
ENV=/opt/ecst/env
val() { grep "^$1=" "$ENV" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

host=$(val DJANGO_ALLOWED_HOSTS | cut -d, -f1)
problem=""
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -H "Host: $host" \
  -H 'X-Forwarded-Proto: https' http://127.0.0.1:8100/api/public/health)
[ "$code" = 200 ] || problem="API health answered ${code:-nothing}"
for unit in ecst-api ecst-worker; do
  systemctl is-active --quiet "$unit" || problem="${problem:+$problem; }$unit is not active"
done
[ -z "$problem" ] && exit 0

echo "unhealthy: $problem"
if (cd /opt/ecst/app/backend && set -a && . "$ENV" && set +a \
    && /opt/ecst/venv/bin/python manage.py notify_ops --unit ecst-health --detail "$problem"); then
  exit 1
fi

# Django could not even send the alert: plain SMTP, once an hour.
to=$(val OPS_ALERT_EMAIL)
stamp=/var/tmp/ecst-alert-fallback
[ -n "$to" ] || { echo "OPS_ALERT_EMAIL not set: no fallback mail"; exit 1; }
[ -f "$stamp" ] && [ $(( $(date +%s) - $(stat -c %Y "$stamp") )) -lt 3600 ] && exit 1
from=$(val DEFAULT_FROM_EMAIL | sed 's/.*<\(.*\)>.*/\1/')
msg=$(mktemp)
printf 'From: %s\r\nTo: %s\r\nSubject: =?UTF-8?B?%s?=\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n' \
  "$from" "$to" "$(printf 'تنبيه: المنصة متوقفة على %s' "$(hostname)" | base64 -w0)" \
  "$(date '+%F %T'): $problem — Django could not start either. journalctl -u ecst-api -n 50" > "$msg"
port=$(val SMTP_PORT); port=${port:-587}
curl -s --ssl-reqd --url "smtp://$(val SMTP_HOST):$port" \
  --user "$(val SMTP_USER):$(val SMTP_PASSWORD)" --mail-from "$from" --mail-rcpt "$to" \
  -T "$msg" && touch "$stamp" && echo "fallback mail sent"
rm -f "$msg"
exit 1
