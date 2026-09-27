"""Abstract base models shared by every app (docs/05 §5 conventions)."""

import uuid

from django.db import models
from django.utils.translation import get_language


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


class BilingualNameModel(models.Model):
    """``name_ar`` is required; ``name_en`` is optional and falls back to Arabic."""

    name_ar = models.CharField(max_length=200)
    name_en = models.CharField(max_length=200, blank=True)

    class Meta:
        abstract = True

    @property
    def name(self) -> str:
        if (get_language() or "ar").startswith("en") and self.name_en:
            return self.name_en
        return self.name_ar

    def __str__(self) -> str:
        return self.name_ar


class SingletonModel(models.Model):
    """A settings table with exactly one row (pk=1)."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError(f"{type(self).__name__} is a singleton and cannot be deleted.")

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
