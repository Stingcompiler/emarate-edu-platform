from django.apps import AppConfig


class LearningConfig(AppConfig):
    name = "learning"
    verbose_name = "Learning"

    def ready(self):
        from . import access

        access.register_file_policies()
