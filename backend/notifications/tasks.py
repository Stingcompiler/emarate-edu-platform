from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from . import push, services
from .mail import send_mail
from .models import Notification, Outbox, PushSubscription

MAX_ATTEMPTS = 5


@shared_task(acks_late=True)
def fan_out(notification_id: int) -> int:
    notification = Notification.objects.filter(pk=notification_id).first()
    if notification is None:
        return 0
    return services.fan_out(notification)


@shared_task
def send_push(subscription_id: int, notification_id: int) -> bool:
    subscription = PushSubscription.objects.filter(pk=subscription_id).first()
    notification = Notification.objects.filter(pk=notification_id).first()
    # Hidden by its sender meanwhile (a busy worker, a retry): nothing is sent (R81).
    if subscription is None or notification is None or notification.hidden_at is not None:
        return False
    return push.send(subscription, services.push_payload(notification))


# A claimed email not marked within this time is tried again (its worker died mid-send).
CLAIM = timedelta(minutes=10)


@shared_task
def deliver_outbox(limit: int = 200) -> int:
    """Send pending emails; failures retry with backoff (1, 2, 4, 8 minutes), then give up.

    The batch is claimed in a short transaction, then each email is sent and marked on its
    own: a worker stopped in the middle resends at most the one it was sending, not the
    whole batch its rolled-back transaction would have left pending (review 2026-11-15, R97).
    """
    now = timezone.now()
    with transaction.atomic():
        rows = list(
            Outbox.objects.select_for_update(skip_locked=True)
            .filter(status=Outbox.Status.PENDING)
            .exclude(next_try_at__gt=now)[:limit]
        )
        for row in rows:
            row.attempts += 1
            row.next_try_at = now + CLAIM
        Outbox.objects.bulk_update(rows, ["attempts", "next_try_at"])
    sent = 0
    for row in rows:
        # Cancelled meanwhile (its notification hidden, R81): not sent.
        if not Outbox.objects.filter(pk=row.pk, status=Outbox.Status.PENDING).exists():
            continue
        try:
            send_mail(row.subject, row.body, None, [row.to])
        except Exception as error:
            changes = {"last_error": str(error)[:300]}
            if row.attempts >= MAX_ATTEMPTS:
                changes["status"] = Outbox.Status.FAILED
            else:
                changes["next_try_at"] = timezone.now() + timedelta(minutes=2 ** (row.attempts - 1))
        else:
            changes = {"status": Outbox.Status.SENT, "next_try_at": None}
            sent += 1
        Outbox.objects.filter(pk=row.pk).update(**changes, updated_at=timezone.now())
    return sent


@shared_task
def remind_due_assignments() -> int:
    """Once per assignment: remind students who have not submitted, 24 hours before the deadline."""
    from . import events

    return events.remind_due_assignments()
