from django.apps import AppConfig


class FilesConfig(AppConfig):
    name = "files"
    verbose_name = "Files"

    def ready(self) -> None:
        from . import signals  # noqa: F401  (a video leaves Bunny Stream with its row)
