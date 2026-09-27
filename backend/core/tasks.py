from celery import shared_task


@shared_task
def ping() -> str:
    """Smoke-test task: proves the Celery wiring works in every environment."""
    return "pong"
