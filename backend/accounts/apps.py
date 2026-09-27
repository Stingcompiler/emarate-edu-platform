from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "accounts"
    verbose_name = "Accounts"

    def ready(self):
        from . import schema  # noqa: F401  (registers the OpenAPI auth extension)
