from celery import shared_task


@shared_task
def remind_live_sessions() -> int:
    from .services import remind_upcoming

    return remind_upcoming()
