from celery import shared_task


@shared_task
def expire_applications() -> int:
    from .services import expire_closed

    return expire_closed()
