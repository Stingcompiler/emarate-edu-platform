from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "accounts"
    verbose_name = "Accounts"

    def ready(self):
        from . import profile, schema  # noqa: F401  (schema: the OpenAPI auth extension)

        profile.register_file_policy()
