"""Identity: users, role assignments, one-time codes, registration, activation.

docs/05 §6 accounts. There is no ``role`` field on User; roles live in
RoleAssignment (see accounts/rbac.py).
"""

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models

from core.models import PublicIdModel, TimestampedModel

from .rbac import DEPARTMENT_SCOPED_ROLES, Role

# Sorted so the constraint is identical on every run (sets have no stable order).
_SCOPED = sorted(r.value for r in DEPARTMENT_SCOPED_ROLES)


class UserManager(DjangoUserManager):
    """Email is the login; there is no username."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self._create_user(email, password, **extra_fields)


class User(PublicIdModel, AbstractUser):
    """Platform user. Students sign in with email or university number."""

    username = None
    first_name = None
    last_name = None
    email = models.EmailField(unique=True)
    full_name_ar = models.CharField(max_length=200)
    full_name_en = models.CharField(max_length=200, blank=True)
    phone_e164 = models.CharField(max_length=20, blank=True)
    must_change_password = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name_ar"]

    objects = UserManager()

    class Meta(AbstractUser.Meta):
        swappable = "AUTH_USER_MODEL"
        ordering = ["email"]
        db_table = "accounts_user"

    def __str__(self) -> str:
        return f"{self.full_name_ar} <{self.email}>"

    def get_full_name(self) -> str:
        return self.full_name_ar

    def get_short_name(self) -> str:
        return self.full_name_ar.split(" ")[0] if self.full_name_ar else self.email


class RoleAssignment(TimestampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="role_assignments"
    )
    role = models.CharField(max_length=30, choices=Role.choices)
    department = models.ForeignKey(
        "organization.Department",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="role_assignments",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role", "department"],
                condition=models.Q(department__isnull=False),
                name="uniq_role_per_department",
            ),
            models.UniqueConstraint(
                fields=["user", "role"],
                condition=models.Q(department__isnull=True),
                name="uniq_college_role",
            ),
            # Registrar / manager / supervisor need a department; others must not have one.
            models.CheckConstraint(
                condition=(
                    models.Q(role__in=_SCOPED, department__isnull=False)
                    | (~models.Q(role__in=_SCOPED) & models.Q(department__isnull=True))
                ),
                name="role_department_scope",
            ),
        ]

    def __str__(self) -> str:
        suffix = f" @ {self.department_id}" if self.department_id else ""
        return f"{self.user_id}: {self.role}{suffix}"


class OneTimeCode(TimestampedModel):
    """Hashed 6-digit code sent by email (docs/05 §8.1: 10 minutes, 5 attempts)."""

    class Purpose(models.TextChoices):
        REGISTER = "register", "تسجيل طالب"
        PASSWORD_RESET = "password_reset", "استعادة كلمة المرور"
        CONTACT = "contact", "تحقق زائر"

    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    target = models.CharField(max_length=254)  # normalized email
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["purpose", "target", "created_at"])]


class RegistrationRequest(PublicIdModel, TimestampedModel):
    class Status(models.TextChoices):
        OTP_PENDING = "otp_pending", "بانتظار رمز التحقق"
        VERIFIED = "verified", "تحقّق البريد"
        PENDING_APPROVAL = "pending_approval", "بانتظار الاعتماد"
        APPROVED = "approved", "معتمد"
        REJECTED = "rejected", "مرفوض"

    # Null when the submitted details matched no record: the flow still looks
    # identical to the caller so it cannot be used to probe who is enrolled.
    student_record = models.ForeignKey(
        "students.StudentRecord",
        on_delete=models.CASCADE,
        null=True,
        related_name="registration_requests",
    )
    email = models.EmailField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OTP_PENDING)
    otp = models.ForeignKey(OneTimeCode, on_delete=models.SET_NULL, null=True, related_name="+")
    verified_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]


class ActivationToken(TimestampedModel):
    """Single-use link to set a password (new staff accounts; accepted applicants later)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activation_tokens"
    )
    token_hash = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
