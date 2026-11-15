"""The platform's maintenance switch, for whoever runs the server (review 2026-11-15, R120):

manage.py maintenance --status       is it closed, and is a backup being made or restored?
manage.py maintenance --open         open it after a restore that could not finish
manage.py maintenance --wait-idle N  wait (N seconds at most) until no backup is being made
                                     or restored — a deploy runs this before restarting
                                     the worker, which would cut a restore short
"""

import json
import time

from django.core.management.base import BaseCommand, CommandError

from core import backups, maintenance, restore


class Command(BaseCommand):
    help = "Show, open or wait on the maintenance switch and the backups' lock."

    def add_arguments(self, parser):
        what = parser.add_mutually_exclusive_group(required=True)
        what.add_argument("--status", action="store_true")
        what.add_argument("--open", action="store_true")
        what.add_argument("--wait-idle", type=int, metavar="SECONDS")

    def handle(self, *args, **options):
        if options["open"]:
            maintenance.end()
            maintenance.new_epoch()
            self.stdout.write(self.style.SUCCESS("The platform is open."))
            return
        if options["wait_idle"] is not None:
            deadline = time.monotonic() + options["wait_idle"]
            while backups.lock_holder() is not None:
                if time.monotonic() >= deadline:
                    raise CommandError("A backup is still being made or restored.")
                time.sleep(10)
            self.stdout.write("No backup is being made or restored.")
            return
        holder = backups.lock_holder() or {}
        found = restore.state() or {}
        self.stdout.write(
            json.dumps(
                {
                    "maintenance": maintenance.state(),
                    "lock": {k: v for k, v in holder.items() if k != "token"} or None,
                    "restore": {k: found.get(k) for k in ("state", "stamp", "step", "code")}
                    if found
                    else None,
                },
                ensure_ascii=False,
            )
        )
