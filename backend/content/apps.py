from django.apps import AppConfig
from django.db.models.signals import post_migrate


class ContentConfig(AppConfig):
    name = "content"
    verbose_name = "Content"

    def ready(self):
        from .official import ensure_drafts

        # The official pages exist from the first deploy, as drafts (content/official.py).
        post_migrate.connect(ensure_drafts, sender=self)
