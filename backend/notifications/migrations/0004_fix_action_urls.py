"""Notifications sent before 2026-11-01 point to portal paths that never existed (owner: «عند
التنقل من الإشعارات لا تظهر الصفحة»). Rewrite them to the pages the portal has."""

import re

from django.db import migrations

RULES = [
    (re.compile(r"^/courses/[^/]+/lectures/([^/?#]+)$"), r"/lectures/\1"),
    (re.compile(r"^/registration-requests/[^/?#]+$"), "/department/approvals"),
    (re.compile(r"^/my-cases/[^/?#]+$"), "/me/status"),
    (re.compile(r"^/misconduct-reports/[^/?#]+$"), "/cases?tab=reports"),
    (re.compile(r"^/live/(?!new$)[^/?#]+$"), "/live"),
]


def fix(apps, schema_editor):
    Notification = apps.get_model("notifications", "Notification")
    rows = Notification.objects.filter(action_url__regex=r"^/(courses/[^/]+/lectures|registration-requests|my-cases|misconduct-reports|live)/")
    for row in rows.iterator():
        for pattern, target in RULES:
            new = pattern.sub(target, row.action_url)
            if new != row.action_url:
                Notification.objects.filter(pk=row.pk).update(action_url=new)
                break


class Migration(migrations.Migration):
    dependencies = [("notifications", "0003_ops_category")]
    operations = [migrations.RunPython(fix, migrations.RunPython.noop)]
