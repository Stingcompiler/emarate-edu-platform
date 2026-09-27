from django.core.management.base import BaseCommand

from notifications.push import _generate


class Command(BaseCommand):
    help = "Print a new VAPID key pair for Web Push (put them in the production environment)."

    def handle(self, *args, **options):
        keys = _generate()
        self.stdout.write(f"VAPID_PUBLIC_KEY={keys['public']}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={keys['private']}")
