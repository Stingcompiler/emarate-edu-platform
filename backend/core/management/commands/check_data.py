"""Read-only: what the database must hold that its constraints cannot say (core.integrity).
Exits 1 when a check finds rows that break it. Safe on the production database."""

from django.core.management.base import BaseCommand, CommandError

from core import integrity


class Command(BaseCommand):
    help = "Check the data's cross-table rules (read-only); exit 1 when one is broken."

    def handle(self, *args, **options):
        checks, notes = integrity.run()
        for name, rows in checks:
            self.stdout.write(
                f"{'ok ' if rows == 0 else 'BAD'}  {name}" + (f": {rows}" if rows else "")
            )
        for name, rows in notes:
            self.stdout.write(f"note {name}: {rows}")
        broken = [name for name, rows in checks if rows]
        if broken:
            raise CommandError(f"{len(broken)} rule(s) broken: " + "; ".join(broken))
