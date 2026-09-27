from django.conf import settings
from django.core.checks import Tags, Warning, register


@register(Tags.security, deploy=True)
def private_storage_is_remote(app_configs, **kwargs):
    """Production must not keep private files on the web server's local disk.

    Production uses Bunny Storage (``MEDIA_BACKEND=bunny``, files app); a
    deployment left on local disk is flagged by ``manage.py check --deploy``.
    """
    backend = settings.STORAGES["default"]["BACKEND"]
    if backend.endswith("FileSystemStorage"):
        return [
            Warning(
                "Private media uses local FileSystemStorage.",
                hint="Set MEDIA_BACKEND=bunny and the BUNNY_* variables (see .env.example).",
                id="core.W001",
            )
        ]
    return []
