"""Copy the server's uploaded files to Bunny (files.move). Run before switching
MEDIA_BACKEND to bunny, and once more after it; scripts/vps/set-bunny-storage.sh does both."""

from django.core.management.base import BaseCommand, CommandError

from files import move


class Command(BaseCommand):
    help = "Copy MEDIA_ROOT/private and MEDIA_ROOT/public to the Bunny zones (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="Count what would be sent; send nothing."
        )

    def handle(self, *args, dry_run=False, **options):
        try:
            found = move.move(dry_run=dry_run, say=self.stdout.write)
        except Exception as error:
            raise CommandError(f"{type(error).__name__}: {str(error)[:300]}") from None
        verb = "would send" if dry_run else "sent"
        self.stdout.write(
            f"{found['files']} files: {verb} {found['sent']} "
            f"({found['bytes'] / 1_048_576:.1f} MB), already there {found['already']}"
        )
        for line in found["failed"][:20]:
            self.stderr.write(f"failed: {line}")
        for line in found["missing"][:20]:
            self.stderr.write(f"missing on Bunny: {line}")
        if found["failed"] or found["missing"]:
            raise CommandError(
                f"{len(found['failed'])} failed, {len(found['missing'])} missing — run it again"
            )
        if not dry_run:
            self.stdout.write("every file is on Bunny")
