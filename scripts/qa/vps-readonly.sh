#!/usr/bin/env bash
# Read-only checks of the ECST server (review 2026-11-10, axis 6). Changes nothing; prints no
# secret (never reads /opt/ecst/env or the demo password). Touches only ECST's services.
# The owner runs it (server commands are the owner's):
#   ssh ovh-prod 'bash -s' < scripts/qa/vps-readonly.sh
set -u
line() { printf '\n--- %s\n' "$1"; }

line "server"
hostname; uptime | sed 's/^ *//'

line "deployed versions"
for part in autodeploy backend portal site; do
  printf '%-11s %s\n' "$part" "$(sudo head -c 200 /opt/ecst/deployed/$part 2>/dev/null | tr '\n' ' ')"
done

line "services"
for s in ecst-api ecst-worker ecst-site-build.path ecst-site-build.timer ecst-autodeploy.timer \
  ecst-backup.timer caddy postgresql redis-server; do
  printf '%-24s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null)"
done

line "autodeploy: last runs"
sudo journalctl -u ecst-autodeploy --since "-2 days" --no-pager -o cat 2>/dev/null \
  | grep -Ei "deployed|failed|ci-|error" | tail -8

line "latest migrations per app (the review's 14)"
sudo -u postgres psql -d ecst -At -F ' ' -c "
  select app, max(name) from django_migrations
  where app in ('students','organization','content','accounts','notifications','academic')
  group by app order by app;" 2>&1

line "medicine and engineering programmes: levels"
sudo -u postgres psql -d ecst -At -F ' | ' -c "
  select p.code, p.name_ar, p.levels_count, p.duration_terms
  from organization_program p join organization_department d on d.id = p.department_id
  where d.name_ar like 'الطب%' or d.name_ar like 'الهندسة%' order by p.code;" 2>&1

line "R78: university numbers that differ only in letter case (count only)"
sudo -u postgres psql -d ecst -At -c "
  select count(*) from (select upper(university_number) from students_studentrecord
  group by 1 having count(*) > 1) t;" 2>&1

line "students, departments, programmes (counts)"
sudo -u postgres psql -d ecst -At -F ' ' -c "
  select 'students', count(*) from students_studentrecord
  union all select 'departments', count(*) from organization_department
  union all select 'programmes', count(*) from organization_program;" 2>&1

line "backups on the server (newest 7)"
sudo ls -lht /opt/ecst/media/private/backups/ 2>/dev/null | head -8

line "disk and errors"
df -h / | tail -1
sudo journalctl -u ecst-api --since "-1 day" --no-pager -o cat 2>/dev/null \
  | grep -cE "ERROR|Traceback" | sed 's/^/api errors in the last day: /'

line "health"
curl -s -o /dev/null -w "api health: %{http_code}\n" -H "X-Forwarded-Proto: https" \
  http://127.0.0.1:8100/api/public/health
