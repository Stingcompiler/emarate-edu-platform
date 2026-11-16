"""A video stored on Bunny Stream leaves it with its row (owner, 2026-11-16): a deleted lecture,
course, programme or department takes its videos with it, there too — not only here."""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import VideoAsset

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=VideoAsset)
def _video_gone(sender, instance: VideoAsset, **kwargs) -> None:
    if instance.provider != VideoAsset.Provider.BUNNY or not instance.provider_id:
        return
    video_id = instance.provider_id

    def remove() -> None:
        from . import bunny

        try:
            bunny.stream_delete_video(video_id)
        except Exception:  # the row is gone; a video left on Stream is only storage
            logger.warning("could not delete video %s from Bunny Stream", video_id)

    transaction.on_commit(remove)
