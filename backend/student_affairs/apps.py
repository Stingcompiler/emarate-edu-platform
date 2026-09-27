from django.apps import AppConfig


class StudentAffairsConfig(AppConfig):
    name = "student_affairs"
    verbose_name = "Student affairs"

    def ready(self):
        from . import access

        access.register_file_policies()
