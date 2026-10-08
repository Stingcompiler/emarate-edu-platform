"""Application lifecycle (docs/01 K.4–K.6, docs/02 §4.11, docs/05 §8.3).

One transition table decides who may move an application where. Every move
writes an append-only history row and an audit entry.
"""

from __future__ import annotations

import re
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from academic.models import Term
from accounts import rbac
from accounts.rbac import Role
from audit.services import SYSTEM, RequestMeta, record
from core.errors import Conflict, Invalid
from files import validation
from notifications.models import Category, Outbox
from notifications.services import notify
from organization.models import SystemSettings
from students.models import StudentRecord
from students.services import issue_university_number

from .models import (
    Application,
    ApplicationAssignment,
    ApplicationDocument,
    ApplicationFormTemplate,
    ApplicationMessage,
    ApplicationStatusHistory,
    ProgramIntake,
)

S = Application.Status
OPEN_FOR_APPLICANT = {S.DRAFT, S.MISSING_DOCUMENTS}
BEFORE_ACCEPTED = {
    S.DRAFT,
    S.SUBMITTED,
    S.UNDER_REVIEW,
    S.MISSING_DOCUMENTS,
    S.ELIGIBLE,
    S.WAITLISTED,
}
FINISHED = {S.REJECTED, S.WITHDRAWN, S.EXPIRED}

# (from, to) -> who may do it: applicant | reviewer | decider | system
TRANSITIONS: dict[tuple[str, str], str] = {
    (S.DRAFT, S.SUBMITTED): "applicant",
    (S.SUBMITTED, S.UNDER_REVIEW): "reviewer",
    (S.UNDER_REVIEW, S.MISSING_DOCUMENTS): "reviewer",
    (S.MISSING_DOCUMENTS, S.UNDER_REVIEW): "applicant",
    (S.UNDER_REVIEW, S.ELIGIBLE): "reviewer",
    (S.UNDER_REVIEW, S.REJECTED): "decider",
    (S.ELIGIBLE, S.ACCEPTED): "decider",
    (S.ELIGIBLE, S.REJECTED): "decider",
    (S.ELIGIBLE, S.WAITLISTED): "decider",
    (S.WAITLISTED, S.ACCEPTED): "decider",
    (S.WAITLISTED, S.REJECTED): "decider",
    (S.ACCEPTED, S.REGISTERED): "system",  # register_applicant
    (S.REGISTERED, S.ACTIVATED): "system",
    (S.SUBMITTED, S.EXPIRED): "system",
    (S.UNDER_REVIEW, S.EXPIRED): "system",
}
for _status in BEFORE_ACCEPTED:
    TRANSITIONS[(_status, S.WITHDRAWN)] = "applicant"


# ─── Who is who ───────────────────────────────────────────────────────────


def can_review(user, application: Application) -> bool:
    return rbac.can(user, "admissions.review", application.department_id)


def can_decide(user, application: Application) -> bool:
    if rbac.can(user, "admissions.manage"):
        return True
    return SystemSettings.load().delegate_decisions_to_registrars and can_review(user, application)


def allowed_transitions(user, application: Application) -> list[str]:
    out = []
    for (source, target), who in TRANSITIONS.items():
        if source != application.status:
            continue
        if (who == "reviewer" and can_review(user, application)) or (
            who == "decider" and can_decide(user, application)
        ):
            out.append(target)
    return sorted(out)


def staff_q(user) -> Q:
    scope = rbac.scope_for(user, "admissions.view")
    if scope.everything:
        return Q(pk__isnull=False)
    return Q(intake__program__department__in=scope.departments)


def _record_move(
    application: Application, source: str, target: str, by=None, note: str = ""
) -> None:
    ApplicationStatusHistory.objects.create(
        application=application,
        from_status=source,
        to_status=target,
        changed_by=by,
        note=note[:500],
    )


def _email(application: Application, subject: str, body: str) -> None:
    if not application.email:
        return
    Outbox.objects.create(
        to=application.email,
        subject=f"{subject} — {application.reference_no}",
        body=(
            f"{body}\n\nرقم الطلب: {application.reference_no}\n"
            "تابع طلبك من صفحة «متابعة طلبي» في موقع الكلية."
        ),
    )
    from notifications.tasks import deliver_outbox

    transaction.on_commit(lambda: deliver_outbox.delay())


# ─── Form templates ───────────────────────────────────────────────────────

FIELD_TYPES = {
    "text",
    "textarea",
    "number",
    "email",
    "phone",
    "date",
    "select",
    "multiselect",
    "boolean",
    "file",
    "note",
}


def schema_fields(schema: dict) -> list[dict]:
    return [
        field
        for step in schema.get("steps", [])
        for section in step.get("sections", [])
        for field in section.get("fields", [])
    ]


def check_schema(schema: dict) -> list[str]:
    problems, keys = [], set()
    if not isinstance(schema, dict) or not isinstance(schema.get("steps"), list):
        return ["The schema needs a list of steps."]
    for field in schema_fields(schema):
        key = field.get("key")
        if not key or not re.fullmatch(r"[a-z][a-z0-9_]{0,40}", str(key)):
            problems.append(f"Field key {key!r} must be lowercase letters, digits or _.")
        elif key in keys:
            problems.append(f"Field key {key!r} is used twice.")
        keys.add(key)
        if field.get("type") not in FIELD_TYPES:
            problems.append(f"{key}: unknown type {field.get('type')!r}.")
        if field.get("type") in ("select", "multiselect") and not field.get("options"):
            problems.append(f"{key}: add the options.")
    return problems


def _visible(field: dict, answers: dict) -> bool:
    condition = field.get("show_if")
    if not condition:
        return True
    return answers.get(condition.get("key")) == condition.get("equals")


def validate_answers(schema: dict, answers: dict, documents: set[str]) -> dict[str, str]:
    errors: dict[str, str] = {}
    for field in schema_fields(schema):
        key, kind = field.get("key"), field.get("type")
        if kind == "note" or not _visible(field, answers):
            continue
        value = answers.get(key)
        empty = value in (None, "", [])
        if kind == "file":
            if field.get("required") and key not in documents:
                errors[key] = "Upload this document."
            continue
        if empty:
            if field.get("required"):
                errors[key] = "Required."
            continue
        if kind == "number":
            try:
                number = float(value)
            except (TypeError, ValueError):
                errors[key] = "Must be a number."
                continue
            if ("min" in field and number < float(field["min"])) or (
                "max" in field and number > float(field["max"])
            ):
                errors[key] = "Out of range."
        elif kind == "email":
            try:
                validate_email(str(value))
            except DjangoValidationError:
                errors[key] = "Invalid email."
        elif kind == "select" and value not in field.get("options", []):
            errors[key] = "Choose one of the options."
        elif kind == "multiselect" and not (
            isinstance(value, list) and set(value) <= set(field.get("options", []))
        ):
            errors[key] = "Choose from the options."
        if (
            field.get("pattern")
            and isinstance(value, str)
            and not re.fullmatch(field["pattern"], value)
        ):
            errors[key] = "Invalid format."
    return errors


def template_for(intake: ProgramIntake) -> ApplicationFormTemplate | None:
    if intake.form_template_id:
        return intake.form_template
    return (
        ApplicationFormTemplate.objects.filter(
            name="default", status=ApplicationFormTemplate.Status.PUBLISHED
        )
        .order_by("-version")
        .first()
    )


def publish_template(
    meta: RequestMeta, template: ApplicationFormTemplate
) -> ApplicationFormTemplate:
    if template.status != ApplicationFormTemplate.Status.DRAFT:
        raise Conflict(gettext("Only a draft can be published."), code="not_draft")
    problems = check_schema(template.schema)
    if problems:
        raise Invalid({"schema": problems}, code="bad_schema")
    with transaction.atomic():
        ApplicationFormTemplate.objects.filter(
            name=template.name, status=ApplicationFormTemplate.Status.PUBLISHED
        ).update(status=ApplicationFormTemplate.Status.RETIRED)
        template.status = ApplicationFormTemplate.Status.PUBLISHED
        template.save(update_fields=["status", "updated_at"])
        record(meta, "admissions.template_publish", template)
    return template


def new_template_version(
    meta: RequestMeta, template: ApplicationFormTemplate
) -> ApplicationFormTemplate:
    latest = ApplicationFormTemplate.objects.filter(name=template.name).order_by("-version").first()
    draft = ApplicationFormTemplate.objects.create(
        name=template.name,
        version=latest.version + 1,
        schema=template.schema,
        created_by=meta.actor,
    )
    record(meta, "admissions.template_version", draft)
    return draft


# ─── Applicant side ───────────────────────────────────────────────────────


def _reference() -> str:
    return f"APP-{timezone.now():%Y}-{secrets.randbelow(10**6):06d}"


def start(contact, intake: ProgramIntake) -> Application:
    if not intake.accepting():
        raise Invalid(
            {"intake": [gettext("This program is not accepting applications now.")]}, code="closed"
        )
    mine = Application.objects.filter(contact=contact, intake__cycle=intake.cycle).exclude(
        status__in=FINISHED
    )
    if mine.filter(intake__program=intake.program_id).exists():
        raise Conflict(
            gettext("You already have an application for this program."), code="duplicate"
        )
    limit = SystemSettings.load().max_applications_per_cycle
    if mine.count() >= limit:
        raise Conflict(
            gettext("At most %(limit)s applications per admission cycle.") % {"limit": limit},
            code="limit",
        )
    template = template_for(intake)
    for _ in range(5):
        try:
            with transaction.atomic():
                application = Application.objects.create(
                    reference_no=_reference(),
                    contact=contact,
                    intake=intake,
                    form_template=template,
                    full_name=contact.name,
                    email=contact.email or "",
                    phone_e164=contact.phone_e164 or "",
                )
                _record_move(application, "", S.DRAFT)
                record(
                    SYSTEM, "admissions.start", application, department_id=application.department_id
                )
            return application
        except IntegrityError:
            continue
    raise Conflict(gettext("Please try again."), code="retry")


def own(contact, public_id) -> Application:
    application = (
        Application.objects.select_related(
            "intake__program__department", "intake__cycle", "form_template"
        )
        .filter(public_id=public_id, contact=contact)
        .first()
    )
    if application is None:
        raise NotFound()
    return application


def _locked(application: Application) -> Application:
    """Locks the application row for this transaction and re-reads it into the same object: a
    save that arrives after a submission (an autosave in flight) sees the new status, never
    the state it was handed (review 2026-10-08, R01). Callers keep using their object."""
    list(Application.objects.select_for_update().filter(pk=application.pk).values_list("pk"))
    application.refresh_from_db()
    return application


def update(
    contact, application: Application, *, full_name=None, phone_e164=None, answers=None
) -> Application:
    if answers is not None and not isinstance(answers, dict):
        raise ValidationError({"answers": [gettext("Send an object of answers.")]})
    with transaction.atomic():
        application = _locked(application)
        if application.status not in OPEN_FOR_APPLICANT:
            raise Conflict(
                gettext(
                    "The application can only change while it is a draft or missing documents."
                ),
                code="locked",
            )
        changed = ["updated_at"]
        if full_name is not None:
            application.full_name = full_name.strip()[:200]
            changed.append("full_name")
        if phone_e164 is not None:
            from inquiries.services import normalize_phone

            application.phone_e164 = normalize_phone(phone_e164) or ""
            changed.append("phone_e164")
        if answers is not None:
            application.answers = {**application.answers, **answers}
            changed.append("answers")
        # Only what the applicant edits: never status or submitted_at.
        application.save(update_fields=changed)
    return application


def add_document(contact, application: Application, doc_type: str, upload) -> ApplicationDocument:
    if application.status not in OPEN_FOR_APPLICANT:
        raise Conflict(
            gettext("Documents can be added while the application is open."), code="locked"
        )
    try:
        kind = validation.check(upload, allowed={"pdf", "jpg", "jpeg", "png"}, max_mb=10)
    except validation.UploadError as error:
        raise ValidationError({"file": [str(error)]}) from None
    with transaction.atomic():
        # One file per document type: a new upload replaces the old one.
        for old in application.documents.filter(doc_type=doc_type):
            old.file.delete(save=False)
            old.delete()
        document = ApplicationDocument.objects.create(
            application=application,
            doc_type=doc_type[:50],
            file=upload,
            name=upload.name[:255],
            size=upload.size,
            mime=kind.mime,
        )
    return document


def submit(contact, application: Application) -> Application:
    """Idempotent: an already-submitted application is returned unchanged."""
    with transaction.atomic():
        return _submit(_locked(application))


def _submit(application: Application) -> Application:
    if application.status not in OPEN_FOR_APPLICANT:
        return application
    errors = {}
    if not application.full_name:
        errors["full_name"] = "Required."
    if not application.email and not application.phone_e164:
        errors["email"] = "Give an email or a phone number."
    documents = set(application.documents.values_list("doc_type", flat=True))
    template = application.form_template
    if template is not None:
        errors.update(validate_answers(template.schema, application.answers, documents))
    for required in application.intake.required_documents:
        if required.get("required") and required.get("key") not in documents:
            errors[required.get("key", "document")] = "Upload this document."
    if errors:
        raise Invalid({k: [v] for k, v in errors.items()}, code="incomplete")
    if application.status == S.DRAFT and not application.intake.accepting():
        raise Invalid({"intake": [gettext("The admission window has closed.")]}, code="closed")
    with transaction.atomic():
        source = application.status
        target = S.SUBMITTED if source == S.DRAFT else S.UNDER_REVIEW
        application.status = target
        if source == S.DRAFT:
            application.submitted_at = timezone.now()
        application.save()
        _record_move(application, source, target)
        record(
            SYSTEM,
            "admissions.submit",
            application,
            new={"status": target},
            department_id=application.department_id,
        )
        User = get_user_model()
        handlers = User.objects.filter(
            is_active=True,
            role_assignments__role=Role.REGISTRAR,
            role_assignments__department=application.department_id,
        ).distinct()
        if not handlers.exists():
            handlers = User.objects.filter(
                is_active=True, role_assignments__role=Role.HEAD_REGISTRAR
            )
        notify(
            handlers,
            category=Category.COLLEGE,
            title=(
                f"طلب تقديم {'جديد' if source == S.DRAFT else 'استُكمل'}: "
                f"{application.intake.program.name_ar}"
            ),
            body=f"{application.full_name} · {application.reference_no}",
            action_url=f"/applications/{application.public_id}",
        )
        _email(application, "استلمنا طلبك", "شكرًا لتقديمك. سنراجع الطلب ونبلغك بأي تحديث.")
    return application


def withdraw(contact, application: Application) -> Application:
    if (application.status, S.WITHDRAWN) not in TRANSITIONS:
        raise Conflict(gettext("This application can no longer be withdrawn."), code="locked")
    with transaction.atomic():
        source = application.status
        application.status = S.WITHDRAWN
        application.save(update_fields=["status", "updated_at"])
        _record_move(application, source, S.WITHDRAWN, note="بطلب المتقدم")
        record(SYSTEM, "admissions.withdraw", application, department_id=application.department_id)
    return application


def applicant_message(contact, application: Application, body: str) -> ApplicationMessage:
    if application.status in FINISHED:
        raise Conflict(gettext("This application is closed."), code="closed")
    message = ApplicationMessage.objects.create(
        application=application, channel=ApplicationMessage.Channel.PORTAL, body=body
    )
    if application.assigned_registrar_id:
        notify(
            [application.assigned_registrar],
            category=Category.COLLEGE,
            title=f"رد من المتقدم {application.full_name}",
            action_url=f"/applications/{application.public_id}",
        )
    return message


# ─── Staff side ───────────────────────────────────────────────────────────


def require_review(user, application: Application) -> None:
    if not can_review(user, application):
        raise PermissionDenied(gettext("This application belongs to another department."))


def claim(meta: RequestMeta, application: Application) -> Application:
    require_review(meta.actor, application)
    return _assign(meta, application, meta.actor)


def assign(meta: RequestMeta, application: Application, registrar) -> Application:
    if not rbac.can(meta.actor, "admissions.manage"):
        raise PermissionDenied()
    if registrar is not None and not rbac.can(
        registrar, "admissions.review", application.department_id
    ):
        raise ValidationError(
            {"registrar": [gettext("This person does not register for this department.")]}
        )
    return _assign(meta, application, registrar)


def _assign(meta, application, registrar) -> Application:
    with transaction.atomic():
        application.assigned_registrar = registrar
        application.save(update_fields=["assigned_registrar", "updated_at"])
        if registrar is not None:
            ApplicationAssignment.objects.create(
                application=application, registrar=registrar, assigned_by=meta.actor
            )
            if registrar != meta.actor:
                notify(
                    [registrar],
                    category=Category.COLLEGE,
                    title=f"أُسند إليك طلب {application.reference_no}",
                    action_url=f"/applications/{application.public_id}",
                )
        record(
            meta,
            "admissions.assign",
            application,
            new={"registrar": getattr(registrar, "pk", None)},
            department_id=application.department_id,
        )
    return application


def transition(
    meta: RequestMeta, application: Application, *, to: str, note: str = ""
) -> Application:
    require_review(meta.actor, application)
    if to not in allowed_transitions(meta.actor, application):
        raise Conflict(
            gettext("You cannot move this application from %(status)s to %(to)s.")
            % {"status": application.status, "to": to},
            code="bad_transition",
        )
    if to == S.MISSING_DOCUMENTS and not note.strip():
        raise ValidationError({"note": [gettext("Tell the applicant what is missing.")]})
    with transaction.atomic():
        # Re-read under a lock: a move made meanwhile (say, accepted) wins and this request
        # gets 409 instead of overwriting a final decision (review 2026-10-04, C3).
        current = Application.objects.select_for_update().get(pk=application.pk)
        if current.status != application.status or to not in allowed_transitions(
            meta.actor, current
        ):
            raise Conflict(
                gettext("This application changed meanwhile; reload it and decide again."),
                code="stale",
            )
        application = current
        source = application.status
        application.status = to
        if to in (S.ACCEPTED, S.REJECTED, S.WAITLISTED):
            application.decided_by = meta.actor
            application.decided_at = timezone.now()
            application.decision_note = note
        if (
            application.assigned_registrar_id is None
            and to == S.UNDER_REVIEW
            and rbac.has_role(meta.actor, Role.REGISTRAR)
        ):
            application.assigned_registrar = meta.actor
        application.save()
        _record_move(application, source, to, by=meta.actor, note=note)
        record(
            meta,
            "admissions.transition",
            application,
            old={"status": source},
            new={"status": to},
            department_id=application.department_id,
        )
        messages = {
            S.MISSING_DOCUMENTS: ("مستندات مطلوبة لطلبك", f"نحتاج منك: {note}"),
            S.ELIGIBLE: ("طلبك مؤهل", "اجتاز طلبك المراجعة الأولية، والقرار النهائي قريبًا."),
            S.ACCEPTED: (
                "تهانينا، قُبلت",
                "قُبل طلبك. ستصلك رسالة بالرقم الجامعي وطريقة تفعيل الحساب.",
            ),
            S.REJECTED: ("قرار طلبك", f"نأسف، لم يُقبل الطلب.{f' السبب: {note}' if note else ''}"),
            S.WAITLISTED: ("طلبك في قائمة الانتظار", "سنبلغك فور توفر مقعد."),
        }
        if to in messages:
            _email(application, *messages[to])
    return application


def staff_message(
    meta: RequestMeta, application: Application, *, body: str, channel: str
) -> ApplicationMessage:
    require_review(meta.actor, application)
    if channel not in ("email", "internal"):
        raise ValidationError(
            {"channel": [gettext("Email the applicant or add an internal note.")]}
        )
    with transaction.atomic():
        message = ApplicationMessage.objects.create(
            application=application, author=meta.actor, channel=channel, body=body
        )
        if channel == "email":
            _email(application, "رسالة بخصوص طلبك", body)
        record(meta, f"admissions.{channel}", application, department_id=application.department_id)
    return message


def review_document(
    meta: RequestMeta, document: ApplicationDocument, *, status: str, note: str = ""
) -> ApplicationDocument:
    require_review(meta.actor, document.application)
    document.status = status
    document.note = note[:300]
    document.save(update_fields=["status", "note", "updated_at"])
    record(
        meta,
        "admissions.document_review",
        document.application,
        new={"doc": document.doc_type, "status": status},
        department_id=document.application.department_id,
    )
    return document


def _university_number(program) -> str:
    return issue_university_number(program)


def register_applicant(meta: RequestMeta, application: Application) -> StudentRecord:
    """Accepted applicant → StudentRecord with a university number (docs/01 K.5). Atomic."""
    if not rbac.can(meta.actor, "admissions.manage"):
        raise PermissionDenied(gettext("Only the head registrar registers applicants."))
    with transaction.atomic():
        locked = Application.objects.select_for_update().get(pk=application.pk)
        if locked.status != S.ACCEPTED or locked.student_record_id:
            raise Conflict(
                gettext("Only an accepted, not yet registered applicant can be registered."),
                code="bad_state",
            )
        program = locked.intake.program
        record_ = StudentRecord.objects.create(
            university_number=_university_number(program),
            full_name_ar=locked.full_name,
            program=program,
            level=1,
            email=locked.email,
            phone_e164=locked.phone_e164,
            admitted_term=Term.current(),
        )
        locked.student_record = record_
        locked.status = S.REGISTERED
        locked.save(update_fields=["student_record", "status", "updated_at"])
        _record_move(locked, S.ACCEPTED, S.REGISTERED, by=meta.actor)
        record(
            meta,
            "admissions.register",
            locked,
            new={"university_number": record_.university_number},
            department_id=program.department_id,
        )
        from django.conf import settings

        _email(
            locked,
            "رقمك الجامعي وتفعيل الحساب",
            f"رقمك الجامعي: {record_.university_number}\n"
            f"فعّل حسابك من {settings.PORTAL_BASE_URL.rstrip('/')}/register"
            " بالرقم الجامعي واسمك وبريدك هذا.",
        )
    return record_


def mark_activated(student_record) -> None:
    """Called when the registered student creates their account (Phase 1 registration)."""
    application = Application.objects.filter(
        student_record=student_record, status=S.REGISTERED
    ).first()
    if application is None:
        return
    application.status = S.ACTIVATED
    application.save(update_fields=["status", "updated_at"])
    _record_move(application, S.REGISTERED, S.ACTIVATED)


def expire_closed() -> int:
    """Beat: submitted / under-review applications of a closed cycle expire."""
    now = timezone.now()
    stale = Application.objects.filter(
        status__in=[S.SUBMITTED, S.UNDER_REVIEW],
        intake__cycle__closes_at__lt=now - timedelta(days=30),
    )
    count = 0
    for application in stale:
        source = application.status
        application.status = S.EXPIRED
        application.save(update_fields=["status", "updated_at"])
        _record_move(application, source, S.EXPIRED, note="انتهت الدورة")
        count += 1
    return count


# ─── Documents ────────────────────────────────────────────────────────────


def resolve_document(public_id):
    document = ApplicationDocument.objects.filter(public_id=public_id).first()
    if document is None:
        return None
    return document.file, document.name, document.mime, False


def document_link(document: ApplicationDocument):
    from files.services import sign

    return sign(document.file.name, "a", document.public_id)
