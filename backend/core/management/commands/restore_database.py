from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core import backups


class Command(BaseCommand):
    help = (
        "List backups, or decrypt one to a local .dump file for pg_restore (see docs/runbook.md). "
        "It never writes to the database itself."
    )

    def add_arguments(self, parser):
        parser.add_argument("--name", help="Stored backup name (from --list).")
        parser.add_argument("--out", help="Local path for the decrypted pg_dump file.")
        parser.add_argument("--list", action="store_true", help="List stored backups.")

    def handle(self, *args, **options):
        if options["list"] or not options["name"]:
            for name in sorted(
                backups.existing(backups.DB_SUFFIX) + backups.existing(backups.MEDIA_SUFFIX)
            ):
                self.stdout.write(name)
            return
        if not options["out"]:
            raise CommandError("--out is required with --name.")
        out = Path(options["out"])
        backups.decrypt_to(options["name"], out)
        self.stdout.write(self.style.SUCCESS(f"Decrypted to {out}"))
        if options["name"].endswith(backups.MEDIA_SUFFIX):
            self.stdout.write(f"Unpack into MEDIA_ROOT with: tar -xzf {out} -C <MEDIA_ROOT>")
            return
        self.stdout.write(
            "Restore with: pg_restore --clean --if-exists --no-owner --no-privileges "
            f'--dbname "$DATABASE_URL" {out}'
        )
