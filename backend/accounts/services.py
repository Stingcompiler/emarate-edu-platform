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
from .models import (
    ActivationToken,
    IdentityReport,
    OneTimeCode,
    RegistrationRequest,
    RoleAssignment,
    User,
)
from .rbac import DEPARTMENT_SCOPED_ROLES, Role

ACTIVATION_DAYS = 7


def _email(value: str) -> str:
    return (value or "").strip().lower()


# ─── Registration (docs/05 §8.1) ──────────────────────────────────────────


def _identity(university_number: str, full_name: str, program: str) -> StudentRecord | None:
    """The record these details name: number, programme and name all match it.

    The details are public (owner, 2026-11-07); the email code then proves the inbox, and a
    student whose record was claimed by someone else reports it (``report_identity``). The
    name may be typed as in the record in Arabic or in English.
    """
    record_ = (
        # Typed in any case (review 2026-11-10, R79: «26-it-0001» found nothing).
        StudentRecord.objects.filter(university_number__iexact=university_number.strip())
        .select_related("user", "program")
        .first()
    )
    if record_ is None or record_.program.code.casefold() != program.strip().casefold():
        return None
    names = [record_.full_name_ar, record_.full_name_en]
    if not any(name and names_match(full_name, name) for name in names):
        return None
    return record_


def registration_programs():
    """The programmes a student picks from when registering: every one that is open, and every
    one that still has students on file, even if it is paused or its department is (review
    2026-11-08: a paused programme's students must still be able to register)."""
    from django.db.models import Q

    from organization.models import Program

    return (
        Program.objects.filter(
            Q(is_active=True, department__is_active=True) | Q(students__isnull=False)
        )
        .distinct()
        .select_related("department")
        .order_by("department__name_ar", "name_ar")
    )


def start_registration(
    university_number: str, full_name: str, program: str, email: str
) -> RegistrationRequest:
    """Step 1. Always returns a request; only a real match gets an email.

    A request with no student_record behaves exactly like a real one for the
    caller (verify will just fail). Details that name a record already holding an
    account get 409, so its student can report the account (owner, 2026-11-07).
    """
    email = _email(email)
    record_ = _identity(university_number, full_name, program)
    if record_ is not None and record_.user_id is not None:
        if (
            not record_.user.is_active
            and record_.registration_requests.filter(
                status=RegistrationRequest.Status.PENDING_APPROVAL
            ).exists()
        ):
            # Most often the student's own account, waiting for the department: say so, so they
            # wait for the approval email instead of reporting themselves (review 2026-11-08).
            raise Conflict(
                gettext(
                    "An account on this university number is waiting for the department's "
                    "approval. If it is not yours, report it."
                ),
                code="pending_approval",
            )
        raise Conflict(
            gettext(
                "This university number already has an account. If it is not yours, report it."
            ),
            code="already_registered",
        )
    if (
        record_ is not None
        and record_.registration_requests.filter(
            status=RegistrationRequest.Status.PENDING_APPROVAL, moves_account=True
        ).exists()
    ):
        # A graduate's account waits to move here (owner, 2026-11-08): no second account.
        raise Conflict(
            gettext(
                "An account on this university number is waiting for the department's "
                "approval. If it is not yours, report it."
            ),
            code="pending_approval",
        )
    # A record whose account moved on (to a master's) is archived: never offered an account
    # again, even if its status is later corrected (review 2026-11-08).
    matched = (
        record_ is not None
        and record_.status == StudentRecord.Status.ACTIVE
        and record_.account_moved_at is None
        and record_.account_moved_to_id is None
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


def complete_registration(request: RegistrationRequest, password: str) -> str:
    """Step 3. Creates the account, active at once or pending approval, or moves a graduate's
    own account to this record. Returns ``"active"``, ``"pending_approval"`` or ``"moved"``."""
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
        if (
            locked.registration_requests.filter(
                status=RegistrationRequest.Status.PENDING_APPROVAL, moves_account=True
            )
            .exclude(pk=request.pk)
            .exists()
        ):
            # A graduate's move went pending after this request was verified: the start refuses
            # such a record, and so does the finish (review 2026-11-10, R57).
            raise Conflict(
                gettext(
                    "An account on this university number is waiting for the department's "
                    "approval. If it is not yours, report it."
                ),
                code="pending_approval",
            )
        existing = User.objects.select_for_update().filter(email=request.email).first()
        if existing is not None:
            # A graduate's own inbox on a new record (the master's): the account moves.
            return _request_move(
                request, locked, existing, password, official_email, needs_approval
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
        if official_email and official_email != request.email:
            # The college's address for this student hears of it at once: if it was not them,
            # they report it from the registration page (owner, 2026-11-07).
            used = request.email
            transaction.on_commit(lambda: emails.registered_elsewhere(official_email, used))
    return "active" if user.is_active else "pending_approval"


# A student whose earlier stage is over: the account may move to their new record.
FINISHED = frozenset({StudentRecord.Status.GRADUATED, StudentRecord.Status.WITHDRAWN})


def _same_person(a: StudentRecord, b: StudentRecord) -> bool:
    names_a = [n for n in (a.full_name_ar, a.full_name_en) if n]
    names_b = [n for n in (b.full_name_ar, b.full_name_en) if n]
    return any(names_match(x, y) for x in names_a for y in names_b)


def _check_move(record_: StudentRecord, account: User) -> StudentRecord:
    """The account's own record, if it may move to ``record_``; else 409. Only from a finished
    stage (graduated or withdrawn) under the same name, and only an active account: one that
    staff disabled is not turned back on by a visitor. Call with both rows locked."""
    earlier = StudentRecord.objects.select_for_update().filter(user=account).first()
    if earlier is None or earlier.status not in FINISHED or not _same_person(earlier, record_):
        raise Conflict(
            gettext("This email is already used by another account."), code="email_taken"
        )
    if not account.is_active:
        raise Conflict(
            gettext(
                "Your earlier account is disabled. Ask the registrar to enable it, then "
                "register again."
            ),
            code="account_disabled",
        )
    return earlier


def _move(meta: RequestMeta, record_: StudentRecord, account: User, earlier: StudentRecord):
    """The account leaves ``earlier`` (archived: nothing comes over) for ``record_``."""
    earlier.user = None
    earlier.account_moved_to = record_
    earlier.account_moved_at = timezone.now()
    earlier.save(update_fields=["user", "account_moved_to", "account_moved_at", "updated_at"])
    record_.user = account
    record_.save(update_fields=["user", "updated_at"])
    account.full_name_ar = record_.full_name_ar
    account.full_name_en = record_.full_name_en
    account.save(update_fields=["full_name_ar", "full_name_en"])
    RoleAssignment.objects.get_or_create(user=account, role=Role.STUDENT, department=None)
    from admissions.services import mark_activated

    mark_activated(record_)
    record(
        meta,
        "registration.account_moved",
        record_,
        old={"university_number": earlier.university_number, "program": earlier.program.code},
        new={"email": account.email, "university_number": record_.university_number},
        department_id=record_.department_id,
    )
    to, number, program = account.email, record_.university_number, record_.program.name_ar
    transaction.on_commit(lambda: emails.account_moved(to, number, program))


def _request_move(
    request: RegistrationRequest,
    record_: StudentRecord,
    account: User,
    password: str,
    official_email: str,
    needs_approval: bool,
) -> str:
    """The student registers on a new record (a master's, added by hand with a new university
    number) with the email of their own earlier account: that account moves to the new record
    instead of a second one being made (owner, 2026-11-08).

    The code just sent to this inbox proves it is theirs, so the new password is set now, as in
    a password reset. The move itself follows the rule of a new account: an email other than
    the record's official one waits for the department (review 2026-11-08: two students may
    share a name). Runs inside complete_registration's transaction, with ``record_`` locked.
    """
    earlier = _check_move(record_, account)
    if (
        RegistrationRequest.objects.filter(
            email=account.email,
            moves_account=True,
            status=RegistrationRequest.Status.PENDING_APPROVAL,
        )
        .exclude(pk=request.pk)
        .exists()
    ):
        # One move at a time: a second card could only fail once the first is approved
        # (review 2026-11-10, R60).
        raise Conflict(
            gettext("A move of this account already waits for the department's approval."),
            code="move_pending",
        )
    account.set_password(password)
    account.save(update_fields=["password"])
    _revoke_refresh_tokens(account)  # a new password: other sessions sign in again
    if official_email and official_email != request.email:
        used = request.email
        transaction.on_commit(lambda: emails.registered_elsewhere(official_email, used))
    if needs_approval:
        request.status = RegistrationRequest.Status.PENDING_APPROVAL
        request.moves_account = True
        request.save(update_fields=["status", "moves_account", "updated_at"])
        record(
            SYSTEM,
            "registration.move_requested",
            record_,
            old={"university_number": earlier.university_number},
            new={"email": account.email, "status": request.status},
            department_id=record_.department_id,
        )
        to, program = account.email, record_.program.name_ar
        transaction.on_commit(lambda: emails.account_move_pending(to, program))
        events.registration_pending(request)
        # Not «pending_approval»: the account works meanwhile, on its earlier record.
        return "move_pending"
    _move(SYSTEM, record_, account, earlier)
    request.status = RegistrationRequest.Status.APPROVED
    request.decided_at = timezone.now()
    request.save(update_fields=["status", "decided_at", "updated_at"])
    events.account_moved(record_)  # no card to decide: the department still hears of it
    return "moved"


def _decide_move(
    meta: RequestMeta, request: RegistrationRequest, student: StudentRecord, approve: bool
) -> None:
    """A pending move (``moves_account``): approving moves the account, rejecting leaves it on
    its earlier record. Inside decide_registration's transaction, request locked.

    A card whose account is gone, or whose record got an account meanwhile, can only be
    closed: approving answers 409 ``stale``, rejecting closes it without a word to anyone
    (review 2026-11-10, R58: both used to answer 409, so the card stayed for good)."""
    account = User.objects.select_for_update().filter(email=request.email).first()
    record_ = StudentRecord.objects.select_for_update().get(pk=student.pk)
    stale = account is None or record_.user_id is not None
    program = record_.program.name_ar
    if approve:
        if stale:
            raise Conflict(
                gettext("This record now holds another account. Reject this request."),
                code="stale",
            )
        _move(meta, record_, account, _check_move(record_, account))
        events.account_move_approved(account, record_)
    elif not stale:
        to, reason = request.email, request.reason
        transaction.on_commit(lambda: emails.account_move_rejected(to, program, reason))


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
        if request.moves_account:
            request.decided_by = meta.actor
            request.decided_at = timezone.now()
            request.reason = reason
            _decide_move(meta, request, student, approve)
            request.status = (
                RegistrationRequest.Status.APPROVED
                if approve
                else RegistrationRequest.Status.REJECTED
            )
            request.save(
                update_fields=["status", "decided_by", "decided_at", "reason", "updated_at"]
            )
            record(
                meta,
                "registration.approve" if approve else "registration.reject",
                student,
                new={"status": request.status, "reason": reason, "moves_account": True},
                department_id=student.department_id,
            )
            return request
        user = student.user
        if user is None or user.is_active or user.email != request.email:
            # Approved or removed meanwhile, or the record now holds another account (an
            # impersonation report freed it): this card is stale.
            raise already
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


# ─── Identity reports (owner, 2026-11-07) ─────────────────────────────────


def report_identity(
    university_number: str, full_name: str, program: str, email: str, note: str = ""
) -> IdentityReport:
    """The student whose record already has an account says it is not theirs."""
    record_ = _identity(university_number, full_name, program)
    if record_ is None or record_.user_id is None:
        raise Invalid(
            {"university_number": [gettext("These details do not match an existing account.")]},
            code="no_account",
        )
    email = _email(email)
    open_ = IdentityReport.objects.filter(
        student_record=record_, account=record_.user, status=IdentityReport.Status.OPEN
    )
    same = open_.filter(contact_email=email).first()
    if same is not None:
        return same  # sent twice: one report is enough
    # The approvers hear of the first open report on an account; later ones join the list
    # quietly (review 2026-11-10, R80: one notification each, from as many addresses).
    first = not open_.exists()
    with transaction.atomic():
        report = IdentityReport.objects.create(
            student_record=record_, account=record_.user, contact_email=email, note=note.strip()
        )
        record(
            SYSTEM,
            "registration.identity_report",
            record_,
            new={"contact_email": email},
            department_id=record_.department_id,
        )
        if first:
            events.identity_reported(report)
    return report


def decide_identity_report(
    meta: RequestMeta, report: IdentityReport, uphold: bool, reason: str = ""
) -> IdentityReport:
    """Uphold: the account is disabled and the record freed, so its student registers.

    The account is disabled, never deleted: what was done with it stays on record.
    """
    student = report.student_record
    if not rbac.can(meta.actor, "registration.approve", student.department_id):
        raise PermissionDenied()
    already = Conflict(gettext("This report was already decided."), code="already_decided")
    with transaction.atomic():
        report = IdentityReport.objects.select_for_update().get(pk=report.pk)
        if report.status != IdentityReport.Status.OPEN:
            raise already
        student = StudentRecord.objects.select_for_update().get(pk=student.pk)
        account = report.account
        if uphold:
            if account is None or student.user_id != account.pk:
                raise already  # the account was already removed or replaced
            if account.pk == meta.actor.pk:
                raise PermissionDenied()
            student.user = None
            student.save(update_fields=["user", "updated_at"])
            account.is_active = False
            account.save(update_fields=["is_active"])
            account.role_assignments.filter(role=Role.STUDENT).delete()
            _revoke_refresh_tokens(account)
            # Its registration, if still waiting, is closed: approving that stale card later
            # would activate whichever account the record holds then (review 2026-11-08).
            RegistrationRequest.objects.filter(
                student_record=student,
                status__in=[
                    RegistrationRequest.Status.OTP_PENDING,
                    RegistrationRequest.Status.VERIFIED,
                    RegistrationRequest.Status.PENDING_APPROVAL,
                ],
            ).update(
                status=RegistrationRequest.Status.REJECTED,
                decided_by=meta.actor,
                decided_at=timezone.now(),
                reason=gettext("The account was stopped after an impersonation report."),
                updated_at=timezone.now(),
            )
            # A move this account asked for waits on ANOTHER record: closed too, or its card
            # could never be approved and kept that record shut (review 2026-11-10, R59).
            RegistrationRequest.objects.filter(
                email=account.email,
                moves_account=True,
                status=RegistrationRequest.Status.PENDING_APPROVAL,
            ).update(
                status=RegistrationRequest.Status.REJECTED,
                decided_by=meta.actor,
                decided_at=timezone.now(),
                reason=gettext("The account was stopped after an impersonation report."),
                updated_at=timezone.now(),
            )
        # Every other open report on this account is settled by the same decision, and each of
        # its senders is told and logged (review 2026-11-08).
        others = list(
            IdentityReport.objects.select_for_update()
            .filter(account=account, status=IdentityReport.Status.OPEN)
            .exclude(pk=report.pk)
            if uphold and account is not None
            else []
        )
        for settled in [report, *others]:
            settled.status = (
                IdentityReport.Status.UPHELD if uphold else IdentityReport.Status.DISMISSED
            )
            settled.decided_by = meta.actor
            settled.decided_at = timezone.now()
            settled.reason = reason
            settled.save(
                update_fields=["status", "decided_by", "decided_at", "reason", "updated_at"]
            )
            record(
                meta,
                "registration.identity_upheld" if uphold else "registration.identity_dismissed",
                student,
                old={"account": account.email if account else None},
                new={
                    "status": settled.status,
                    "reason": reason,
                    "contact_email": settled.contact_email,
                },
                department_id=student.department_id,
            )
            to = settled.contact_email
            transaction.on_commit(lambda to=to: emails.identity_report_decided(to, uphold, reason))
    return report


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
    _not_above(meta.actor, user)
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


def _site_staff_changed() -> None:
    """Roles, names and whether an account is active decide who the site's department pages and
    «الكوادر» show: rebuild it after the commit (review 2026-11-12: a new head or a disabled
    account waited for the six-hourly build)."""
    from .staff_profile import site_changed

    site_changed()


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
    _site_staff_changed()
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
        _site_staff_changed()


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
            _site_staff_changed()
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
    """The system admin corrects an account's name. A student's record takes the same name
    (owner, 2026-11-08): the two never disagree."""
    _not_above(meta.actor, user)
    if not rbac.can(meta.actor, "users.rename"):
        raise PermissionDenied()
    old = {"full_name_ar": user.full_name_ar, "full_name_en": user.full_name_en}
    user.full_name_ar = full_name_ar
    if full_name_en is not None:
        user.full_name_en = full_name_en
    new = {"full_name_ar": user.full_name_ar, "full_name_en": user.full_name_en}
    if new == old:
        return user
    with transaction.atomic():
        user.save(update_fields=["full_name_ar", "full_name_en"])
        _student_record_follows(user)
        record(meta, "account.rename", user, old=old, new=new)
    return user


def _student_record_follows(user: User) -> None:
    """A student account renamed by the admin: its student record carries the same name."""
    StudentRecord.objects.filter(user=user).update(
        full_name_ar=user.full_name_ar, full_name_en=user.full_name_en, updated_at=timezone.now()
    )


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
    research interests, photo. Whether they appear on the site stays the person's own consent.
    A student's name is corrected here too and their record follows (owner, 2026-11-08).
    A changed email is unique, and the old address is told. Audited as one change."""
    from django.core.exceptions import ValidationError as DjangoValidationError
    from django.core.validators import validate_email

    from files.models import Purpose, StoredFile
    from inquiries.services import normalize_phone

    _not_above(meta.actor, user)
    if not rbac.can(meta.actor, "users.rename"):
        raise PermissionDenied()

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
    changed = {k: v for k, v in new.items() if old.get(k) != v}
    with transaction.atomic():
        # Only what this edit changed: a full-row save of the copy loaded for the request wrote
        # back a consent the member had just switched (review 2026-11 I5).
        user.save(update_fields=list(changed))
        if {"full_name_ar", "full_name_en"} & set(changed):
            _student_record_follows(user)
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


def _not_above(actor, user) -> None:
    """The system supervisor stands in for the admin, never over them: an admin's or another
    supervisor's account (password, name, profile) is the admin's (owner, 2026-11-05)."""
    if rbac.has_role(actor, Role.SYSTEM_ADMIN):
        return
    if rbac.roles_of(user) & rbac.TOP_ROLES:
        raise PermissionDenied(gettext("Only the system admin changes this account."))


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
        _site_staff_changed()
    return user
