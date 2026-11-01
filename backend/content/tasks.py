from celery import shared_task


@shared_task
def trigger_site_rebuild() -> bool:
    from .services import call_rebuild_hook

    return call_rebuild_hook()


@shared_task
def rebuild_when_due() -> bool:
    """Items scheduled for later (publish_at) or expiring (announcements' expires_at) change
    what the site shows when their time comes, not when they are saved: rebuild then (review
    2026-11-01; they waited for the six-hourly build). Runs every ten minutes."""
    from datetime import timedelta

    from django.core.cache import cache
    from django.db.models import Q
    from django.utils import timezone

    from .models import Announcement, News, Page, Status
    from .services import request_site_rebuild

    now = timezone.now()
    since = cache.get("site-due-checked") or now - timedelta(minutes=10)
    cache.set("site-due-checked", now, timeout=None)
    window = Q(publish_at__gt=since, publish_at__lte=now)
    due = (
        Page.objects.filter(window, status=Status.PUBLISHED).exists()
        or News.objects.filter(window, status=Status.PUBLISHED).exists()
        or Announcement.objects.filter(
            (window | Q(expires_at__gt=since, expires_at__lte=now)),
            status=Status.PUBLISHED,
            audience=Announcement.Audience.PUBLIC,
        ).exists()
    )
    if due:
        request_site_rebuild()
    return due
