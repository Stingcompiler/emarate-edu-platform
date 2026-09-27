from celery import shared_task


@shared_task
def trigger_site_rebuild() -> bool:
    from .services import call_rebuild_hook

    return call_rebuild_hook()
