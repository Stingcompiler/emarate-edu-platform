from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core import backups, restore


class Command(BaseCommand):
    help = (
        "Encrypted pg_dump (and, on a local disk, the uploaded files) to private storage "
        "(backups/); keeps the newest --keep copies of each. Waits for a copy being made or "
        "restored from the portal (one lock: core.backups.holding)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--keep", type=int, default=getattr(settings, "BACKUP_KEEP", 8))
        parser.add_argument(
            "--wait",
            type=int,
            default=3600,
            help="Seconds to wait for a copy or restore in progress (then fail).",
        )

    def handle(self, *args, **options):
        # The daily timer never runs beside a restore: its prune could take the very copy
        # being restored, and its dump fight the restore's locks (review 2026-11-15, R116).
        token = backups.wait_for_lock("timer", options["wait"])
        if token is None:
            raise CommandError("A backup is being made or restored; the timer waited and gave up.")
        with backups.holding("timer", token):
            names = backups.create(options["keep"])
            restore.purge_uploads()  # an upload nobody restored holds a whole college
        from audit.models import AuditLog

        # A plain log row (no model instance to point at).
        AuditLog.objects.create(
            action="backup.create",
            target_type="backup",
            target_id=names[0],
            target_repr=" + ".join(names),
        )
        for name in names:
            self.stdout.write(self.style.SUCCESS(f"Backup stored: {name}"))
