"""Account workflows: registration, login, password reset, staff accounts, roles.

Every write happens inside a transaction and is recorded in the audit log.
Messages shown to anonymous callers are deliberately uniform so they never
reveal whether a university number or email exists (docs/02 §4.3).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, password_validation
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.services import SYSTEM, RequestMeta, record
from core.errors import Conflict, Invalid, Locked
from core.text import names_match
from notifications import events
from organization.models import SystemSettings
from students.models import StudentRecord

from . import emails, otp, rbac
from .models import ActivationToken, OneTimeCode, RegistrationRequest, RoleAssignment, User
from .rbac import DEPARTMENT_SCOPED_ROLES, Role

ACTIVATION_DAYS = 7


def _email(value: str) -> str:
    return (value or "").strip().lower()


# ─── Registration (docs/05 §8.1) ──────────────────────────────────────────


def start_registration(university_number: str, full_name: str, email: str) -> RegistrationRequest:
    """Step 1. Always returns a request; only a real match gets an email.

    A request with no student_record behaves exactly like a real one for the
    caller (verify will just fail), so the endpoint can't confirm who studies here.
    """
    email = _email(email)
    record_ = (
        StudentRecord.objects.filter(university_number=university_number.strip())
        .select_related("user")
        .first()
    )
    matched = (
        record_ is not None
        and record_.user_id is None
        and record_.status == StudentRecord.Status.ACTIVE
        and names_match(full_name, record_.full_name_ar)
    )
    with transaction.atomic():
        request = RegistrationRequest.objects.create(
            student_record=record_ if matched else None, email=email
        )
        if matched:
            code_row, code = otp.issue(OneTimeCode.Purpose.REGISTER, email)
            request.otp = code_row
            request.save(update_fields=["otp", "updated_at"])
            transaction.on_commit(
                lambda: emails.registration_code(email, code, SystemSettings.load().otp_ttl_minutes)
            )
    return request


def verify_registration(request: RegistrationRequest, code: str) -> None:
    """Step 2. Confirms the student owns the email."""
    if request.status != RegistrationRequest.Status.OTP_PENDING:
        raise Invalid({"code": ["Invalid or expired code."]}, code="invalid_code")
    result = otp.check(request.otp, code)
    if result is otp.OTPResult.TOO_MANY_ATTEMPTS:
        raise Locked("Too many attempts. Start the registration again.")
    if result is not otp.OTPResult.OK or request.student_record_id is None:
        raise Invalid({"code": ["Invalid or expired code."]}, code="invalid_code")
    request.status = RegistrationRequest.Status.VERIFIED
    request.verified_at = timezone.now()
    request.save(update_fields=["status", "verified_at", "updated_at"])


def complete_registration(request: RegistrationRequest, password: str) -> User:
    """Step 3. Creates the account. Active immediately, or pending approval."""
    if request.status != RegistrationRequest.Status.VERIFIED:
        raise Invalid({"request_id": ["Verify your email first."]}, code="not_verified")
    student = request.student_record
    password_validation.validate_password(password, User(email=request.email))
    config = SystemSettings.load()
    official_email = _email(student.email)
    # docs/02 §4.3: an email matching the college file needs no approval.
    needs_approval = config.student_registration_requires_approval and (
        not official_email or official_email != request.email
    )
    with transaction.atomic():
        locked = StudentRecord.objects.select_for_update().get(pk=student.pk)
        if locked.user_id is not None:
            raise Conflict("This student already has an account.", code="already_registered")
        try:
            user = User.objects.create_user(
                email=request.email,
                password=password,
                full_name_ar=locked.full_name_ar,
                full_name_en=locked.full_name_en,
                is_active=not needs_approval,
            )
        except IntegrityError:
            raise Conflict(
                "This email is already used by another account.", code="email_taken"
            ) from None
        locked.user = user
        locked.save(update_fields=["user", "updated_at"])
        if not needs_approval:
            from admissions.services import mark_activated

            mark_activated(locked)
        if needs_approval:
            request.status = RegistrationRequest.Status.PENDING_APPROVAL
        else:
            request.status = RegistrationRequest.Status.APPROVED
            request.decided_at = timezone.now()
            RoleAssignment.objects.create(user=user, role=Role.STUDENT)
        request.save(update_fields=["status", "decided_at", "updated_at"])
        record(
            SYSTEM,
            "registration.complete",
            locked,
            new={"email": user.email, "status": request.status},
            department_id=locked.department_id,
            # No actor: self-service by an anonymous visitor. Naming the new user
            # here would also block deleting the account if it is rejected.
        )
        if needs_approval:
            transaction.on_commit(lambda: emails.registration_pending(user.email))
            events.registration_pending(request)
    return user


def decide_registration(
    meta: RequestMeta, request: RegistrationRequest, approve: bool, reason: str = ""
) -> RegistrationRequest:
    """Step 4 (when approval is on): department manager/supervisor or head registrar."""
    student = request.student_record
    if not rbac.can(meta.actor, "registration.approve", student.department_id):
        raise PermissionDenied()
    if request.status != RegistrationRequest.Status.PENDING_APPROVAL:
        raise Conflict("This request was already decided.", code="already_decided")
    with transaction.atomic():
        user = student.user
        request.decided_by = meta.actor
        request.decided_at = timezone.now()
        request.reason = reason
        if approve:
            request.status = RegistrationRequest.Status.APPROVED
            user.is_active = True
            user.save(update_fields=["is_active"])
            RoleAssignment.objects.get_or_create(user=user, role=Role.STUDENT, department=None)
            events.registration_approved(user)
            from admissions.services import mark_activated

            mark_activated(student)
        else:
            request.status = RegistrationRequest.Status.REJECTED
            # The pending account never became usable: remove it so the student
            # can register again once the registrar fixes the record.
            student.user = None
            student.save(update_fields=["user", "updated_at"])
            user.delete()
        request.save(update_fields=["status", "decided_by", "decided_at", "reason", "updated_at"])
        record(
            meta,
            "registration.approve" if approve else "registration.reject",
            student,
            new={"status": request.status, "reason": reason},
            department_id=student.department_id,
        )
        transaction.on_commit(lambda: emails.registration_decided(request.email, approve, reason))
    return request


# ─── Login (docs/05 §8.2) ─────────────────────────────────────────────────


def _lock_key(identifier: str) -> str:
    return "login-fail:" + hashlib.sha256(identifier.encode()).hexdigest()


def login(identifier: str, password: str) -> User:
    """Email or university number + password. Locks after repeated failures."""
    identifier = identifier.strip().lower()
    key = _lock_key(identifier)
    failures = cache.get(key, 0)
    if failures >= settings.LOGIN_MAX_FAILURES:
        raise Locked()

    email = identifier
    if "@" not in identifier:
        record_ = (
            StudentRecord.objects.filter(university_number__iexact=identifier)
            .select_related("user")
            .first()
        )
        email = record_.user.email if record_ and record_.user_id else ""

    user = authenticate(email=email, password=password) if email else None
    if user is None:
        # Pending accounts are inactive: explain instead of a generic error.
        pending = User.objects.filter(email=email, is_active=False).first() if email else None
        if pending is not None and pending.check_password(password):
            raise PermissionDenied("Your account is waiting for approval.", code="pending_approval")
        cache.set(key, failures + 1, timeout=settings.LOGIN_LOCKOUT_SECONDS)
        raise Invalid(
            {"non_field_errors": ["Incorrect email/university number or password."]},
            code="invalid_credentials",
        )
    cache.delete(key)
    return user


# ─── Password reset ───────────────────────────────────────────────────────


def start_password_reset(email: str) -> None:
    email = _email(email)
    user = User.objects.filter(email=email, is_active=True).first()
    if user is None:
        return  # uniform response
    _, code = otp.issue(OneTimeCode.Purpose.PASSWORD_RESET, email)
    transaction.on_commit(
        lambda: emails.password_reset_code(email, code, SystemSettings.load().otp_ttl_minutes)
    )


def reset_password(email: str, code: str, new_password: str) -> None:
    email = _email(email)
    latest = (
        OneTimeCode.objects.filter(purpose=OneTimeCode.Purpose.PASSWORD_RESET, target=email)
        .order_by("-created_at")
        .first()
    )
    user = User.objects.filter(email=email, is_active=True).first()
    result = otp.check(latest, code)
    if result is otp.OTPResult.TOO_MANY_ATTEMPTS:
        raise Locked("Too many attempts. Request a new code.")
    if result is not otp.OTPResult.OK or user is None:
        raise Invalid({"code": ["Invalid or expired code."]}, code="invalid_code")
    password_validation.validate_password(new_password, user)
    with transaction.atomic():
        user.set_password(new_password)
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        _revoke_refresh_tokens(user)
        record(SYSTEM, "account.password_reset", user, actor=user)


def _revoke_refresh_tokens(user: User) -> None:
    """Sign the user out everywhere (after a password change)."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


# ─── Staff accounts and activation ────────────────────────────────────────


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_staff_account(
    meta: RequestMeta,
    *,
    email: str,
    full_name_ar: str,
    full_name_en: str = "",
    phone_e164: str = "",
    role: Role,
    department_id: int | None = None,
) -> User:
    """Create a staff user with one role and email an activation link.

    The creator never sets a password; the owner of the email does.
    """
    if role not in rbac.creatable_accounts(meta.actor):
        raise PermissionDenied("You cannot create accounts with this role.")
    email = _email(email)
    with transaction.atomic():
        if User.objects.filter(email=email).exists():
            raise Conflict("An account with this email already exists.", code="email_taken")
        user = User.objects.create_user(
            email=email,
            password=None,
            full_name_ar=full_name_ar,
            full_name_en=full_name_en,
            phone_e164=phone_e164,
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
        grant_role(meta, user, role, department_id)
        token = issue_activation(user)
        record(
            meta,
            "account.create",
            user,
            new={"email": email, "role": role},
            department_id=department_id,
        )
        transaction.on_commit(
            lambda: emails.account_invitation(email, full_name_ar, token, ACTIVATION_DAYS)
        )
    return user


def issue_activation(user: User) -> str:
    token = secrets.token_urlsafe(32)
    ActivationToken.objects.create(
        user=user,
        token_hash=_token_hash(token),
        expires_at=timezone.now() + timedelta(days=ACTIVATION_DAYS),
    )
    return token


def activate(token: str, password: str) -> User:
    row = (
        ActivationToken.objects.select_related("user")
        .filter(token_hash=_token_hash(token.strip()))
        .first()
    )
    if row is None or row.used_at is not None or row.expires_at <= timezone.now():
        raise Invalid({"token": ["This link is invalid or expired."]}, code="invalid_token")
    password_validation.validate_password(password, row.user)
    with transaction.atomic():
        user = row.user
        user.set_password(password)
        user.is_active = True
        user.save(update_fields=["password", "is_active"])
        row.used_at = timezone.now()
        row.save(update_fields=["used_at", "updated_at"])
        record(SYSTEM, "account.activate", user, actor=user)
    return user


# ─── Roles ────────────────────────────────────────────────────────────────


def _check_department_rule(role: Role, department_id: int | None) -> None:
    if role in DEPARTMENT_SCOPED_ROLES and department_id is None:
        raise ValidationError({"department": ["This role requires a department."]})
    if role not in DEPARTMENT_SCOPED_ROLES and department_id is not None:
        raise ValidationError({"department": ["This role is college-wide."]})


def grant_role(
    meta: RequestMeta, user: User, role: Role, department_id: int | None = None
) -> RoleAssignment:
    if role not in rbac.grantable_roles(meta.actor):
        raise PermissionDenied("You cannot grant this role.")
    if role == Role.STUDENT:
        raise ValidationError({"role": ["Students get their role by registering."]})
    _check_department_rule(role, department_id)
    try:
        with transaction.atomic():
            assignment = RoleAssignment.objects.create(
                user=user, role=role, department_id=department_id, created_by=meta.actor
            )
    except IntegrityError:
        raise Conflict("The user already has this role.", code="role_exists") from None
    record(
        meta,
        "role.grant",
        user,
        new={"role": role, "department_id": department_id},
        department_id=department_id,
    )
    rbac.clear_cache(user)
    return assignment


def revoke_role(meta: RequestMeta, assignment: RoleAssignment) -> None:
    role = Role(assignment.role)
    if role not in rbac.grantable_roles(meta.actor):
        raise PermissionDenied("You cannot revoke this role.")
    if assignment.user_id == getattr(meta.actor, "pk", None) and role == Role.SYSTEM_ADMIN:
        raise ValidationError({"role": ["You cannot remove your own system admin role."]})
    with transaction.atomic():
        user = assignment.user
        record(
            meta,
            "role.revoke",
            user,
            old={"role": assignment.role, "department_id": assignment.department_id},
            department_id=assignment.department_id,
        )
        assignment.delete()
        rbac.clear_cache(user)


def set_active(meta: RequestMeta, user: User, active: bool) -> User:
    """Disable or re-enable a staff account (docs/03 §3.5, §7).

    The system admin may change anyone but themself; academic affairs only
    accounts whose roles it may create (teachers and TAs). Disabling signs the
    user out everywhere; nothing is deleted.
    """
    if user.pk == meta.actor.pk:
        raise PermissionDenied("You cannot disable your own account.")
    held = {Role(r) for r in rbac.roles_of(user)}
    if not rbac.has_role(meta.actor, Role.SYSTEM_ADMIN):
        allowed = rbac.creatable_accounts(meta.actor)
        if not held or not held <= allowed:
            raise PermissionDenied()
    if user.is_active == active:
        return user
    with transaction.atomic():
        user.is_active = active
        user.save(update_fields=["is_active"])
        if not active:
            _revoke_refresh_tokens(user)
        record(
            meta,
            "account.activate" if active else "account.deactivate",
            user,
            old={"is_active": not active},
            new={"is_active": active},
        )
    return user
