"""Account workflows: registration, login, password reset, staff accounts, roles.

Every write happens inside a transaction and is recorded in the audit log.
Messages shown to anonymous callers are deliberately uniform so they never
reveal whether a university number or email exists (docs/02 §4.3).
"""

from __future__ import annotations

import hashlib
import secrets
import time
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import F, ProtectedError, RestrictedError
from django.utils import timezone
from django.utils.translation import gettext
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
        raise Invalid({"code": [gettext("Invalid or expired code.")]}, code="invalid_code")
    result = otp.check(request.otp, code)
    if result is otp.OTPResult.TOO_MANY_ATTEMPTS:
        raise Locked(gettext("Too many attempts. Start the registration again."))
    if result is not otp.OTPResult.OK or request.student_record_id is None:
        raise Invalid({"code": [gettext("Invalid or expired code.")]}, code="invalid_code")
    request.status = RegistrationRequest.Status.VERIFIED
    request.verified_at = timezone.now()
    request.save(update_fields=["status", "verified_at", "updated_at"])


def complete_registration(request: RegistrationRequest, password: str) -> User:
    """Step 3. Creates the account. Active immediately, or pending approval."""
    if request.status != RegistrationRequest.Status.VERIFIED:
        raise Invalid({"request_id": [gettext("Verify your email first.")]}, code="not_verified")
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
            raise Conflict(
                gettext("This student already has an account."), code="already_registered"
            )
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
                gettext("This email is already used by another account."), code="email_taken"
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
    already = Conflict(gettext("This request was already decided."), code="already_decided")
    if request.status != RegistrationRequest.Status.PENDING_APPROVAL:
        raise already
    with transaction.atomic():
        # Locked and re-read: two managers deciding the same request at once, or a stale page,
        # must not turn an approval into a rejection that deletes a working account
        # (review 2026-10-08, R02).
        list(
            RegistrationRequest.objects.select_for_update().filter(pk=request.pk).values_list("pk")
        )
        request.refresh_from_db()
        student.refresh_from_db()
        if request.status != RegistrationRequest.Status.PENDING_APPROVAL:
            raise already
        user = student.user
        if user is None or user.is_active:
            raise already  # the account was approved or removed meanwhile
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
    """Email or university number + password. Locks after repeated failures.

    The lock counts per account (the email the identifier resolves to), so a student's
    email and university number share one budget, and the count is incremented
    atomically. An identifier with no account still spends one password hash, so the
    response time doesn't tell which university numbers have an account.
    """
    identifier = identifier.strip().lower()

    email = identifier
    if "@" not in identifier:
        record_ = (
            StudentRecord.objects.filter(university_number__iexact=identifier)
            .select_related("user")
            .first()
        )
        email = record_.user.email.lower() if record_ and record_.user_id else ""

    key = _lock_key(email or identifier)
    if cache.get(key, 0) >= settings.LOGIN_MAX_FAILURES:
        raise Locked()

    if email:
        user = authenticate(email=email, password=password)
    else:
        make_password(password)  # same cost as a real check
        user = None
    if user is None:
        # Pending accounts are inactive: explain instead of a generic error.
        pending = User.objects.filter(email=email, is_active=False).first() if email else None
        if pending is not None and pending.check_password(password):
            raise PermissionDenied(
                gettext("Your account is waiting for approval."), code="pending_approval"
            )
        cache.add(key, 0, timeout=settings.LOGIN_LOCKOUT_SECONDS)
        try:
            cache.incr(key)
        except ValueError:  # expired between add and incr
            cache.set(key, 1, timeout=settings.LOGIN_LOCKOUT_SECONDS)
        raise Invalid(
            {"non_field_errors": [gettext("Incorrect email/university number or password.")]},
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
        raise Locked(gettext("Too many attempts. Request a new code."))
    if result is not otp.OTPResult.OK or user is None:
        raise Invalid({"code": [gettext("Invalid or expired code.")]}, code="invalid_code")
    password_validation.validate_password(new_password, user)
    with transaction.atomic():
        user.set_password(new_password)
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        _revoke_refresh_tokens(user)
        record(SYSTEM, "account.password_reset", user, actor=user)


TEMP_PASSWORD_LENGTH = 12
_TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alikes


def _temporary_password(user: User) -> str:
    """A random password that passes the validators: letters of both cases and a digit."""
    while True:
        candidate = "".join(secrets.choice(_TEMP_ALPHABET) for _ in range(TEMP_PASSWORD_LENGTH))
        if (
            any(c.islower() for c in candidate)
            and any(c.isupper() for c in candidate)
            and any(c.isdigit() for c in candidate)
        ):
            try:
                password_validation.validate_password(candidate, user)
            except DjangoValidationError:
                continue
            return candidate


def admin_reset_password(meta: RequestMeta, user: User) -> str:
    """The system admin gives an account a temporary password (returned once, never stored in
    the clear or in the log). The account must change it at the next sign-in, and every open
    session of it ends now (review 2026-10-08 R05's token version)."""
    if not rbac.can(meta.actor, "users.reset_password"):
        raise PermissionDenied()
    if user.pk == meta.actor.pk:
        raise PermissionDenied(gettext("Change your own password from your settings."))
    if not user.is_active:
        raise Conflict(
            gettext(
                "Enable the account first: a disabled or not yet activated account has no password."
            ),
            code="inactive",
        )
    temporary = _temporary_password(user)
    with transaction.atomic():
        user.set_password(temporary)
        user.must_change_password = True
        user.save(update_fields=["password", "must_change_password"])
        _revoke_refresh_tokens(user)
        # An unused invitation must not let someone set another password behind the admin's back.
        ActivationToken.objects.filter(user=user, used_at__isnull=True).update(
            used_at=timezone.now(), updated_at=timezone.now()
        )
        record(meta, "account.password_admin_reset", user, new={"must_change_password": True})
    return temporary


def change_password(user: User, current: str, new: str) -> User:
    """A signed-in user changes their own password; other sessions end."""
    if not user.check_password(current):
        raise Invalid(
            {"current_password": [gettext("The current password is wrong.")]}, code="wrong_password"
        )
    if current == new:
        raise Invalid(
            {"new_password": [gettext("Choose a different password.")]}, code="same_password"
        )
    try:
        password_validation.validate_password(new, user)
    except DjangoValidationError as error:
        raise ValidationError({"new_password": list(error.messages)}) from None
    with transaction.atomic():
        user.set_password(new)
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        _revoke_refresh_tokens(user)
        record(SYSTEM, "account.password_change", user, actor=user)
    return user


# A refresh token rotated in the last seconds is accepted once more (two tabs refreshing
# together, accounts/views.py). Signing out or a password change ends that grace for
# every token rotated before it.
REFRESH_CUT = "auth:cut:{}"


def end_refresh_grace(user_id) -> None:
    cache.set(REFRESH_CUT.format(user_id), time.time(), timeout=120)


def issue_tokens(user: User):
    """A refresh token (and through it the access token) stamped with the account's token
    version, so raising the version ends both."""
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    refresh[TOKEN_VERSION_CLAIM] = user.token_version
    return refresh


TOKEN_VERSION_CLAIM = "tv"  # noqa: S105 (a claim name, not a secret)


def _revoke_refresh_tokens(user: User) -> None:
    """Sign the user out everywhere (after a password change, or when disabled): refresh tokens
    are blacklisted and the token version goes up, which also ends the access tokens still
    open (review 2026-10-08, R05)."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)
    User.objects.filter(pk=user.pk).update(token_version=F("token_version") + 1)
    user.refresh_from_db(fields=["token_version"])
    end_refresh_grace(user.pk)


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
        raise PermissionDenied(gettext("You cannot create accounts with this role."))
    email = _email(email)
    with transaction.atomic():
        if User.objects.filter(email=email).exists():
            raise Conflict(
                gettext("An account with this email already exists."), code="email_taken"
            )
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
        raise Invalid(
            {"token": [gettext("This link is invalid or expired.")]}, code="invalid_token"
        )
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
        raise ValidationError({"department": [gettext("This role requires a department.")]})
    if role not in DEPARTMENT_SCOPED_ROLES and department_id is not None:
        raise ValidationError({"department": [gettext("This role is college-wide.")]})


def grant_role(
    meta: RequestMeta, user: User, role: Role, department_id: int | None = None
) -> RoleAssignment:
    if role not in rbac.grantable_roles(meta.actor):
        raise PermissionDenied(gettext("You cannot grant this role."))
    if role == Role.STUDENT:
        raise ValidationError({"role": [gettext("Students get their role by registering.")]})
    if user.pk == meta.actor.pk and not rbac.has_role(meta.actor, Role.SYSTEM_ADMIN):
        raise PermissionDenied(gettext("You cannot grant a role to yourself."))
    if rbac.has_role(user, Role.STUDENT):
        raise ValidationError({"role": [gettext("A student account cannot hold a staff role.")]})
    _check_department_rule(role, department_id)
    try:
        with transaction.atomic():
            assignment = RoleAssignment.objects.create(
                user=user, role=role, department_id=department_id, created_by=meta.actor
            )
    except IntegrityError:
        raise Conflict(gettext("The user already has this role."), code="role_exists") from None
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
        raise PermissionDenied(gettext("You cannot revoke this role."))
    if assignment.user_id == getattr(meta.actor, "pk", None) and role == Role.SYSTEM_ADMIN:
        raise ValidationError({"role": [gettext("You cannot remove your own system admin role.")]})
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


def delete_account(meta: RequestMeta, user: User) -> None:
    """Delete an account that never did anything: an invitation sent by mistake, a duplicate, a
    test. An account anything points at (the audit log, content, grades…) cannot go, because
    those records must keep their author: it is disabled instead (docs/03: nothing with a
    history is deleted)."""
    if not rbac.can(meta.actor, "users.delete"):
        raise PermissionDenied()
    if user.pk == meta.actor.pk:
        raise PermissionDenied(gettext("You cannot delete your own account."))
    snapshot = {
        "email": user.email,
        "name": user.full_name_ar,
        "roles": sorted(rbac.roles_of(user)),
    }
    try:
        with transaction.atomic():
            # The log entry first: it is a plain record (the target is text, not a link), so
            # it survives the account it names; it rolls back with the delete if that fails.
            record(meta, "account.delete", user, old=snapshot)
            user.delete()
    except (ProtectedError, RestrictedError):
        raise Conflict(
            gettext(
                "This account has a history (records, grades or log entries): "
                "disable it instead of deleting it."
            ),
            code="has_history",
        ) from None


def rename_account(
    meta: RequestMeta, user: User, *, full_name_ar: str, full_name_en: str | None = None
) -> User:
    """The system admin corrects a staff member's name. A student's name belongs to the student
    record (the registrar edits it), so a student account is refused here."""
    if not rbac.can(meta.actor, "users.rename"):
        raise PermissionDenied()
    if StudentRecord.objects.filter(user=user).exists():
        raise Conflict(
            gettext("A student's name is edited from the student record."), code="student_account"
        )
    old = {"full_name_ar": user.full_name_ar, "full_name_en": user.full_name_en}
    user.full_name_ar = full_name_ar
    if full_name_en is not None:
        user.full_name_en = full_name_en
    new = {"full_name_ar": user.full_name_ar, "full_name_en": user.full_name_en}
    if new == old:
        return user
    with transaction.atomic():
        user.save(update_fields=["full_name_ar", "full_name_en"])
        record(meta, "account.rename", user, old=old, new=new)
    return user


PROFILE_FIELDS = [
    "full_name_ar",
    "full_name_en",
    "email",
    "phone_e164",
    "academic_title_ar",
    "academic_title_en",
    "research_interests",
    "photo",
]


def update_profile(meta: RequestMeta, user: User, **data) -> User:
    """The system admin edits a user's profile (owner, 2026-10-30): name, email, phone, titles,
    research interests, photo. Two things stay the person's own: whether they appear on the
    site (their consent), and — for a student — the name, which belongs to the student record.
    A changed email is unique, and the old address is told. Audited as one change."""
    from django.core.exceptions import ValidationError as DjangoValidationError
    from django.core.validators import validate_email

    from files.models import Purpose, StoredFile
    from inquiries.services import normalize_phone

    if not rbac.can(meta.actor, "users.rename"):
        raise PermissionDenied()
    student = StudentRecord.objects.filter(user=user).exists()
    if student and ({"full_name_ar", "full_name_en"} & set(data)):
        raise Conflict(
            gettext("A student's name is edited from the student record."), code="student_account"
        )

    def shown(u: User) -> dict:
        snap = {f: getattr(u, f) for f in PROFILE_FIELDS if f != "photo"}
        snap["photo"] = str(u.photo.public_id) if u.photo_id else None
        return snap

    old = shown(user)
    if "email" in data:
        email = (data["email"] or "").strip().lower()
        try:
            validate_email(email)
        except DjangoValidationError:
            raise ValidationError({"email": [gettext("Enter a valid email address.")]}) from None
        if User.objects.filter(email=email).exclude(pk=user.pk).exists():
            raise ValidationError(
                {"email": [gettext("This email is already used by another account.")]}
            )
        user.email = email
    if "phone_e164" in data:
        raw = (data["phone_e164"] or "").strip()
        user.phone_e164 = normalize_phone(raw) if raw else ""
    for f in ("full_name_ar", "full_name_en", "academic_title_ar", "academic_title_en"):
        if f in data:
            user_value = " ".join((data[f] or "").split())
            if f == "full_name_ar" and not user_value:
                raise ValidationError({f: [gettext("The Arabic name cannot be empty.")]})
            setattr(user, f, user_value)
    if "research_interests" in data:
        user.research_interests = (data["research_interests"] or "").strip()
    if "photo" in data:
        photo = data["photo"]
        if photo is not None and not (
            isinstance(photo, StoredFile)
            and photo.purpose == Purpose.PHOTO
            and photo.uploaded_by_id in (meta.actor.pk, user.pk)
        ):
            raise ValidationError({"photo": [gettext("Upload the photo first.")]})
        user.photo = photo
    new = shown(user)
    if new == old:
        return user
    with transaction.atomic():
        user.save()
        changed = {k: v for k, v in new.items() if old.get(k) != v}
        # A name-only change keeps the action it has always had in the log.
        names_only = set(changed) <= {"full_name_ar", "full_name_en"}
        record(
            meta,
            "account.rename" if names_only else "account.profile_update",
            user,
            old={k: old[k] for k in changed},
            new=changed,
        )
    if new["email"] != old["email"]:
        transaction.on_commit(lambda: emails.email_changed(old["email"], new["email"]))
    from .staff_profile import site_changed

    site_changed()
    return user


def set_active(meta: RequestMeta, user: User, active: bool) -> User:
    """Disable or re-enable a staff account (docs/03 §3.5, §7).

    The system admin may change anyone but themself; academic affairs only
    accounts whose roles it may create (teachers and TAs). Disabling signs the
    user out everywhere; nothing is deleted.
    """
    if user.pk == meta.actor.pk:
        raise PermissionDenied(gettext("You cannot disable your own account."))
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
            # An unused invitation must not switch a disabled account back on.
            ActivationToken.objects.filter(user=user, used_at__isnull=True).update(
                used_at=timezone.now(), updated_at=timezone.now()
            )
        elif not user.has_usable_password():
            # Re-enabled before it was ever activated: a fresh invitation replaces the void one.
            token = issue_activation(user)
            email, name = user.email, user.full_name_ar
            transaction.on_commit(
                lambda: emails.account_invitation(email, name, token, ACTIVATION_DAYS)
            )
        record(
            meta,
            "account.activate" if active else "account.deactivate",
            user,
            old={"is_active": not active},
            new={"is_active": active},
        )
    return user
