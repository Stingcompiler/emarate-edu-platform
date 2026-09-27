from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.backends.console import EmailBackend as ConsoleBackend
from django.core.mail.backends.filebased import EmailBackend as FileBackend


class DevEmailBackend(BaseEmailBackend):
    """Development email: print to the console *and* keep a copy on disk.

    The console makes OTP codes visible while working; the files in
    ``backend/sent-emails/`` keep a history to inspect. Configured through
    ``MAILERS["default"]["OPTIONS"]["file_path"]`` (Django 6.1 mailers).
    """

    def __init__(self, *, file_path: str, alias: str | None = None, **kwargs):
        super().__init__(alias=alias, **kwargs)
        self._backends = [
            ConsoleBackend(alias=alias),
            FileBackend(alias=alias, file_path=file_path),
        ]

    def send_messages(self, email_messages):
        sent = 0
        for backend in self._backends:
            sent = backend.send_messages(email_messages) or 0
        return sent
