from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts import services
from accounts.models import RoleAssignment, User
from accounts.rbac import Role
from audit.models import AuditLog


class Command(BaseCommand):
    help = (
        "Bootstrap the first system administrator on a fresh deployment (docs/runbook.md §2). "
        "Prints a one-time activation link; the password is set by the owner of the email."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", required=True, help="Full name in Arabic.")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        with transaction.atomic():
            if User.objects.filter(email=email).exists():
                raise CommandError("An account with this email already exists.")
            user = User.objects.create_user(
                email=email, password=None, full_name_ar=options["name"]
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])
            RoleAssignment.objects.create(user=user, role=Role.SYSTEM_ADMIN)
            token = services.issue_activation(user)
            AuditLog.objects.create(
                action="account.bootstrap_admin",
                target_type="accounts.user",
                target_id=str(user.pk),
                target_repr=email,
            )
        link = f"{settings.PORTAL_BASE_URL.rstrip('/')}/activate/{token}"
        self.stdout.write(self.style.SUCCESS(f"System admin created: {email}"))
        self.stdout.write(
            f"Activation link (valid {services.ACTIVATION_DAYS} days, use once):\n{link}"
        )
