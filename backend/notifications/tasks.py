from datetime import timedelta

from celery import shared_task
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from . import push, services
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
    if subscription is None or notification is None:
        return False
    return push.send(subscription, services.push_payload(notification))


@shared_task
def deliver_outbox(limit: int = 200) -> int:
    """Send pending emails; failures retry with backoff (1, 2, 4, 8 minutes), then give up."""
    now = timezone.now()
    sent = 0
    with transaction.atomic():
        rows = list(
            Outbox.objects.select_for_update(skip_locked=True)
            .filter(status=Outbox.Status.PENDING)
            .exclude(next_try_at__gt=now)[:limit]
        )
        for row in rows:
            row.attempts += 1
            try:
                send_mail(row.subject, row.body, None, [row.to])
            except Exception as error:
                row.last_error = str(error)[:300]
                if row.attempts >= MAX_ATTEMPTS:
                    row.status = Outbox.Status.FAILED
                else:
                    row.next_try_at = now + timedelta(minutes=2 ** (row.attempts - 1))
            else:
                row.status = Outbox.Status.SENT
                sent += 1
            row.save(
                update_fields=["attempts", "status", "next_try_at", "last_error", "updated_at"]
            )
    return sent


@shared_task
def remind_due_assignments() -> int:
    """Once per assignment: remind students who have not submitted, 24 hours before the deadline."""
    from . import events

    return events.remind_due_assignments()
