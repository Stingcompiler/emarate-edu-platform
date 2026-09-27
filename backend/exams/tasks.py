from celery import shared_task


@shared_task
def close_expired_attempts() -> int:
    from .services import close_expired

    return close_expired()


@shared_task
def remind_exams_starting() -> int:
    """Once per exam: tell students it opens within the hour."""
    from datetime import timedelta

    from django.utils import timezone

    from notifications.models import Category
    from notifications.services import notify_audience

    from .models import Exam

    now = timezone.now()
    soon = Exam.objects.filter(
        status=Exam.Status.PUBLISHED,
        reminder_sent_at__isnull=True,
        opens_at__gt=now,
        opens_at__lte=now + timedelta(hours=1),
    ).select_related("offering__course")
    count = 0
    for exam in soon:
        notify_audience(
            {"type": "offering", "ids": [exam.offering_id]},
            category=Category.COURSE,
            title=f"يبدأ خلال ساعة: {exam.title}",
            body=exam.offering.course.name_ar,
            action_url=f"/exams/{exam.public_id}",
        )
        Exam.objects.filter(pk=exam.pk).update(reminder_sent_at=now)
        count += 1
    return count
