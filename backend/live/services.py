"""Who may schedule, see and join live sessions; reminders (docs/03 §7 «جلسات بث»)."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from academic.models import Enrollment, OfferingInstructor
from accounts import rbac
from audit.services import RequestMeta, record
from learning import access
from notifications.models import Category
from notifications.services import notify_audience
from students.models import StudentRecord

from .models import LiveSession

JOIN_EARLY = timedelta(minutes=15)  # the link opens 15 minutes before the start


def can_manage(user, session_or_data) -> bool:
    offering = getattr(session_or_data, "offering", None) or (
        session_or_data.get("offering") if isinstance(session_or_data, dict) else None
    )
    if offering is not None:
        return access.for_offering(user, offering).edit
    program = getattr(session_or_data, "program", None) or session_or_data.get("program")
    return rbac.can(user, "learning.manage", program.department_id)


def visible_q(user) -> Q:
    """Sessions a user may see: staff by course/department, students by enrollment/cohort."""
    staff = access.staff_offerings_q(user) | Q(
        program__department__in=rbac.scope_for(user, "learning.view").departments
    )
    if rbac.scope_for(user, "learning.view").everything:
        staff = Q(pk__isnull=False)
    record_ = StudentRecord.objects.filter(user=user, status="active").first()
    student = Q(pk__in=[])
    if record_ is not None:
        enrolled = Enrollment.objects.filter(student_record=record_, status="active").values(
            "offering_id"
        )
        student = Q(offering_id__in=enrolled) | Q(program=record_.program_id, level=record_.level)
    return staff | student


def save(
    meta: RequestMeta, session: LiveSession | None, *, join_url: str | None = None, **data
) -> LiveSession:
    target = session or data
    if not can_manage(meta.actor, target if session else data):
        raise PermissionDenied(gettext("You cannot schedule sessions for this course or cohort."))
    if join_url is not None and not join_url.startswith("https://"):
        raise ValidationError({"join_url": [gettext("Use the https:// meeting link.")]})
    with transaction.atomic():
        if session is None:
            if not join_url:
                raise ValidationError({"join_url": [gettext("Add the meeting link.")]})
            session = LiveSession(host=meta.actor, **data)
            session.join_url = join_url
            session.full_clean(exclude=["join_url_encrypted"])
            session.save()
            record(
                meta,
                "live.create",
                session,
                new={"starts_at": session.starts_at.isoformat()},
                department_id=session.department_id,
            )
            opens = timezone.localtime(session.starts_at).strftime("%Y-%m-%d %H:%M")
            notify_audience(
                _audience(session),
                category=Category.COURSE,
                title=f"جلسة بث: {session.title}",
                body=f"{opens}",
                action_url=f"/live/{session.public_id}",
            )
            return session
        for field, value in data.items():
            setattr(session, field, value)
        if join_url:
            session.join_url = join_url
        session.save()
        record(meta, "live.update", session, department_id=session.department_id)
    return session


def _audience(session: LiveSession) -> dict:
    if session.offering_id:
        return {"type": "offering", "ids": [session.offering_id]}
    return {"type": "program", "ids": [session.program_id], "level": session.level}


def cancel(meta: RequestMeta, session: LiveSession) -> LiveSession:
    if not can_manage(meta.actor, session):
        raise PermissionDenied()
    session.status = LiveSession.Status.CANCELLED
    session.save(update_fields=["status", "updated_at"])
    record(meta, "live.cancel", session, department_id=session.department_id)
    notify_audience(
        _audience(session),
        category=Category.COURSE,
        title=f"أُلغيت جلسة: {session.title}",
        action_url="/live",
    )
    return session


def join_link(user, session: LiveSession) -> str:
    """The meeting link, only for someone entitled and only near the session time."""
    if not LiveSession.objects.filter(visible_q(user), pk=session.pk).exists():
        raise NotFound()
    if session.status == LiveSession.Status.CANCELLED:
        raise ValidationError({"detail": [gettext("This session was cancelled.")]})
    now = timezone.now()
    staff = (
        can_manage(user, session)
        or OfferingInstructor.objects.filter(offering=session.offering_id, user=user).exists()
    )
    if not staff and not (session.starts_at - JOIN_EARLY <= now <= session.ends_at):
        raise ValidationError(
            {"detail": [gettext("The link opens 15 minutes before the start.")]}, code="not_yet"
        )
    return session.join_url


def remind_upcoming() -> int:
    now = timezone.now()
    soon = LiveSession.objects.filter(
        status=LiveSession.Status.SCHEDULED,
        reminder_sent_at__isnull=True,
        starts_at__gt=now,
        starts_at__lte=now + timedelta(minutes=30),
    )
    count = 0
    for session in soon:
        notify_audience(
            _audience(session),
            category=Category.COURSE,
            title=f"تبدأ خلال 30 دقيقة: {session.title}",
            action_url=f"/live/{session.public_id}",
        )
        LiveSession.objects.filter(pk=session.pk).update(reminder_sent_at=now)
        count += 1
    return count
