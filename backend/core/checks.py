from django.conf import settings
from django.core.checks import Tags, Warning, register


@register(Tags.security, deploy=True)
def private_storage_is_remote(app_configs, **kwargs):
    """Production must not keep private files on the web server's local disk.

    Bunny Storage (private/public zones with signed URLs) is implemented in
    Phase 2; until then ``manage.py check --deploy`` flags the gap.
    """
    backend = settings.STORAGES["default"]["BACKEND"]
    if backend.endswith("FileSystemStorage"):
        return [
            Warning(
                "Private media uses local FileSystemStorage.",
                hint="Configure Bunny Storage before deploying (Phase 2).",
                id="core.W001",
            )
        ]
    return []
