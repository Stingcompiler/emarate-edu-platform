"""Tell the people who run the platform that something failed (review 2026-10-04 A9).

Called by systemd when the backup or the site build fails (OnFailure) and by the health
check (scripts/ops/healthcheck.sh). It sends an email straight away — not through the
worker, which may be the thing that is down — to every active system admin and to
OPS_ALERT_EMAIL when set, and leaves an in-app notification. One alert per unit per hour.
"""

from __future__ import annotations

import socket
import tempfile
import time
from pathlib import Path

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.utils import timezone

QUIET_SECONDS = 3600


class Command(BaseCommand):
    help = "Email the system admins (and OPS_ALERT_EMAIL) that a service failed."

    def add_arguments(self, parser):
        parser.add_argument("--unit", required=True, help="The systemd unit or check that failed.")
        parser.add_argument("--detail", default="", help="One line on what was seen.")

    def handle(self, *args, unit: str, detail: str, **options):
        stamp = Path(tempfile.gettempdir()) / f"ecst-alert-{unit.replace('/', '_')}"
        if stamp.exists() and time.time() - stamp.stat().st_mtime < QUIET_SECONDS:
            self.stdout.write(f"alert for {unit} already sent within the hour")
            return
        from accounts.models import User
        from accounts.rbac import Role
        from notifications.models import Category
        from notifications.services import notify

        admins = list(
            User.objects.filter(is_active=True, role_assignments__role=Role.SYSTEM_ADMIN).distinct()
        )
        recipients = sorted({u.email for u in admins if u.email})
        if getattr(settings, "OPS_ALERT_EMAIL", ""):
            recipients.append(settings.OPS_ALERT_EMAIL)
        when = timezone.localtime().strftime("%Y-%m-%d %H:%M")
        host = socket.gethostname()
        title = f"تنبيه تشغيل: فشل {unit}"
        body = (
            f"فشل {unit} على الخادم {host} في {when}.\n{detail}\n\n"
            f"راجع السجل: journalctl -u {unit} -n 50"
        ).strip()
        sent = 0
        if recipients:
            sent = send_mail(title, body, None, recipients, fail_silently=False)
        if admins:
            notify(admins, category=Category.COLLEGE, title=title, body=body, channels=["inapp"])
        stamp.touch()
        self.stdout.write(f"alert for {unit}: {sent} email(s) to {len(recipients)} recipient(s)")
