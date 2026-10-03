from django.conf import settings
from django.core.management.base import BaseCommand

from core import backups


class Command(BaseCommand):
    help = (
        "Encrypted pg_dump (and, on a local disk, the uploaded files) to private storage "
        "(backups/); keeps the newest --keep copies of each."
    )

    def add_arguments(self, parser):
        parser.add_argument("--keep", type=int, default=getattr(settings, "BACKUP_KEEP", 8))

    def handle(self, *args, **options):
        names = backups.create(options["keep"])
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
