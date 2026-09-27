from django.contrib.auth.models import AbstractUser

from core.models import PublicIdModel


class User(PublicIdModel, AbstractUser):
    """Platform user.

    Deliberately minimal in Phase 0: it exists so the first migration already
    points at a custom user model. Phase 1 adds roles (RoleAssignment), OTP
    registration and the student link.
    """

    class Meta(AbstractUser.Meta):
        swappable = "AUTH_USER_MODEL"
        db_table = "accounts_user"
