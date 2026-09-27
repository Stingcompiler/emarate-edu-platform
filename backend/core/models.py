"""Abstract base models shared by every app (docs/05 §5 conventions)."""

import uuid

from django.db import models


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PublicIdModel(models.Model):
    """Adds a non-guessable identifier for anything exposed in URLs or the API.

    The integer primary key stays internal; links and API payloads use
    ``public_id`` so records cannot be enumerated.
    """

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    class Meta:
        abstract = True
