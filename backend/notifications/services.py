"""Send notifications and fan them out to in-app, push and email."""

from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from audit.services import RequestMeta, record

from . import audience as audiences
from .models import (
    Category,
    Channel,
    Notification,
    NotificationPreference,
    NotificationRecipient,
    Outbox,
    PushSubscription,
)

# Categories that email by default (docs/02 §5.4: results, admission/account).
EMAIL_BY_DEFAULT = {Category.RESULTS, Category.ACCOUNT}
BATCH = 1000


def _channels(channels) -> list[str]:
    clean = sorted(set(channels or [Channel.INAPP, Channel.PUSH]))
    if not set(clean) <= set(Channel.values):
        raise ValidationError({"channels": [f"Choose from {Channel.values}."]})
    if Channel.INAPP not in clean:
        clean.insert(0, Channel.INAPP)  # every notification lands in the inbox
    return clean


def send(
    meta: RequestMeta,
    *,
    title,
    body="",
    category,
    priority="normal",
    action_url="",
    audience,
    channels=None,
) -> Notification:
    """A manual notification from a staff member, limited to their allowed audiences."""
    clean = audiences.authorize(meta.actor, audience)
    with transaction.atomic():
        notification = Notification.objects.create(
            sender=meta.actor,
            kind=Notification.Kind.MANUAL,
            category=category,
            priority=priority,
            title=title,
            body=body,
            action_url=action_url,
            audience=clean,
            channels=_channels(channels),
        )
        record(meta, "notification.send", notification, new={"audience": clean})
        _schedule(notification)
    return notification


def notify(
    users, *, category, title, body="", action_url="", channels=None, kind=Notification.Kind.SYSTEM
) -> Notification | None:
    """A system notification to specific users (automatic events)."""
    ids = sorted({str(u.public_id) for u in users})
    if not ids:
        return None
    notification = Notification.objects.create(
        kind=kind,
        category=category,
        title=title[:160],
        body=body,
        action_url=action_url,
        audience={"type": "users", "ids": ids},
        channels=_channels(channels),
    )
    _schedule(notification)
    return notification


def notify_audience(audience: dict, **kwargs) -> Notification:
    """A system notification to an audience (no sender, so no authorization)."""
    notification = Notification.objects.create(
        kind=Notification.Kind.SYSTEM,
        category=kwargs["category"],
        title=kwargs["title"][:160],
        body=kwargs.get("body", ""),
        action_url=kwargs.get("action_url", ""),
        audience=audiences.normalize(audience),
        channels=_channels(kwargs.get("channels")),
    )
    _schedule(notification)
    return notification


def _schedule(notification: Notification) -> None:
    from .tasks import fan_out

    transaction.on_commit(lambda: fan_out.delay(notification.pk))


def preferences_for(user_ids, category: str) -> dict[int, NotificationPreference]:
    return {
        p.user_id: p
        for p in NotificationPreference.objects.filter(user_id__in=user_ids, category=category)
    }


def _default(category: str) -> NotificationPreference:
    return NotificationPreference(category=category, email=category in EMAIL_BY_DEFAULT)


def fan_out(notification: Notification) -> int:
    """Create inbox rows, send push and queue email, honouring each user's preferences."""
    if notification.fanned_out_at is not None:
        return notification.recipients_count  # idempotent: a retried task does nothing
    users = list(
        audiences.resolve(notification.audience)
        .exclude(pk=notification.sender_id or 0)
        .values_list("pk", "email")
    )
    prefs = preferences_for([pk for pk, _ in users], notification.category)
    channels = set(notification.channels)
    inbox, push_users, emails = [], [], []
    for pk, email in users:
        pref = prefs.get(pk) or _default(notification.category)
        # Account notices always reach the inbox; other categories follow preferences.
        if pref.inapp or notification.category == Category.ACCOUNT:
            inbox.append(NotificationRecipient(notification=notification, user_id=pk))
        if Channel.PUSH in channels and pref.push:
            push_users.append(pk)
        if Channel.EMAIL in channels and pref.email and email:
            emails.append(email)
    with transaction.atomic():
        NotificationRecipient.objects.bulk_create(inbox, batch_size=BATCH, ignore_conflicts=True)
        Outbox.objects.bulk_create(
            [
                Outbox(to=address, subject=notification.title, body=_email_body(notification))
                for address in emails
            ],
            batch_size=BATCH,
        )
        notification.recipients_count = len(inbox)
        notification.fanned_out_at = timezone.now()
        notification.save(update_fields=["recipients_count", "fanned_out_at", "updated_at"])
    if push_users:
        from .tasks import send_push

        for subscription_id in PushSubscription.objects.filter(user_id__in=push_users).values_list(
            "pk", flat=True
        ):
            send_push.delay(subscription_id, notification.pk)
    if emails:
        from .tasks import deliver_outbox

        deliver_outbox.delay()
    return len(inbox)


def push_payload(notification: Notification) -> dict:
    return {
        "title": notification.title,
        "body": notification.body[:240],
        "url": notification.action_url or "/notifications",
        "tag": str(notification.public_id),
        "category": notification.category,
        "urgent": notification.priority == Notification.Priority.URGENT,
    }


def _email_body(notification: Notification) -> str:
    link = notification.action_url or "/notifications"
    if link.startswith("/"):
        link = settings.PORTAL_BASE_URL.rstrip("/") + link
    return f"{notification.body}\n\n{link}\n\n— بوابة كلية الإمارات"


# ─── HR notices (docs/03 §3.11) ───────────────────────────────────────────


def create_hr_notice(
    meta: RequestMeta,
    *,
    teacher,
    body: str,
    requires_ack: bool = True,
    subject: str = "",
    topic: str = "other",
    cc_department_manager: bool = False,
):
    """A directed notice to one teacher, with this term's indicators attached."""
    import json

    from django.core.serializers.json import DjangoJSONEncoder
    from rest_framework.exceptions import PermissionDenied

    from accounts import rbac
    from accounts.rbac import Role

    from . import events
    from .models import HRNotice

    if not rbac.can(meta.actor, "hr.notify"):
        raise PermissionDenied()
    if not rbac.has_role(teacher, Role.TEACHER, Role.TA) or not teacher.is_active:
        raise ValidationError({"teacher": ["Choose a teacher or TA."]})
    from reports.services import teacher_evidence

    evidence, term = teacher_evidence(teacher)
    with transaction.atomic():
        notice = HRNotice.objects.create(
            teacher=teacher,
            sent_by=meta.actor,
            topic=topic,
            subject=(subject.strip() or HRNotice.Topic(topic).label)[:160],
            body=body,
            requires_ack=requires_ack,
            evidence=json.loads(json.dumps(evidence, cls=DjangoJSONEncoder)),
            term=term,
            cc_department_manager=cc_department_manager,
        )
        notice.notification = events.hr_notice(notice)
        notice.save(update_fields=["notification", "updated_at"])
        if cc_department_manager:
            events.hr_notice_copy(notice)
        record(meta, "hr_notice.send", notice, new={"teacher": teacher.email, "topic": topic})
    return notice


def open_hr_notice(notice, user):
    """The teacher opening their notice marks it seen (HR sees "فُتح")."""
    if notice.teacher_id == user.pk and notice.opened_at is None:
        notice.opened_at = timezone.now()
        notice.save(update_fields=["opened_at", "updated_at"])
    return notice


def acknowledge_hr_notice(meta: RequestMeta, notice):
    from core.errors import Conflict

    if notice.acknowledged_at is not None:
        raise Conflict("Already acknowledged.", code="already_acknowledged")
    with transaction.atomic():
        notice.acknowledged_at = timezone.now()
        notice.opened_at = notice.opened_at or notice.acknowledged_at
        notice.save(update_fields=["acknowledged_at", "opened_at", "updated_at"])
        record(meta, "hr_notice.acknowledge", notice)
    return notice
