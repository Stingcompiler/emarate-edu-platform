from django.apps import AppConfig


class AdmissionsConfig(AppConfig):
    name = "admissions"
    verbose_name = "Admissions"

    def ready(self):
        from files import services

        from .services import resolve_document

        services.register_resolver("a", resolve_document)
