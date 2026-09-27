"""Append-only record of every sensitive operation (docs/03 §1.5, docs/05 §6 audit).

Rows are written by the service layer (``audit.services.record``) and are never
updated or deleted — not through the ORM, not through the admin.
"""

from django.conf import settings
from django.db import models


class AuditLogQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise TypeError("Audit log entries are immutable.")

    def delete(self):
        raise TypeError("Audit log entries cannot be deleted.")


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    action = models.CharField(max_length=80)  # e.g. "registration.approve"
    target_type = models.CharField(max_length=80)  # "students.studentrecord"
    target_id = models.CharField(max_length=64)
    target_repr = models.CharField(max_length=255)
    old = models.JSONField(null=True, blank=True)
    new = models.JSONField(null=True, blank=True)
    # Lets department roles read the entries of their own department.
    department = models.ForeignKey(
        "organization.Department", on_delete=models.PROTECT, null=True, related_name="+"
    )
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    objects = AuditLogQuerySet.as_manager()

    class Meta:
        ordering = ["-at", "-id"]
        indexes = [
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["actor", "at"]),
            models.Index(fields=["department", "at"]),
        ]

    def __str__(self) -> str:
        return f"{self.at:%Y-%m-%d %H:%M} {self.action} {self.target_repr}"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise TypeError("Audit log entries are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise TypeError("Audit log entries cannot be deleted.")
