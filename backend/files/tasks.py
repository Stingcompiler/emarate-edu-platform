from celery import shared_task


@shared_task
def purge_discarded_files() -> dict:
    """Daily: deleted files that waited their time leave Bunny (files.trash)."""
    from .trash import purge

    return purge()


@shared_task(bind=True, max_retries=5)
def send_video_to_bunny(self, video_id: int, name: str) -> None:
    """A lecture video uploaded through the platform goes to Bunny here, not in the upload's
    request (files.services.local_video_upload). Tried again for about half an hour; then failed."""
    from . import services

    try:
        services.send_video_to_bunny(video_id, name)
    except Exception as error:
        if self.request.retries >= self.max_retries:
            services.video_failed(video_id, name)
            return
        raise self.retry(exc=error, countdown=60 * 2**self.request.retries) from error
