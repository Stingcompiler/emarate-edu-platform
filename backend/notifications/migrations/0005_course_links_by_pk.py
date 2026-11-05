"""«عُيّنت على مادة» linked /courses/<offering public_id>; the course page reads the offering's
number (review 2026-11). Point the stored links at /courses/<pk>."""

import re

from django.db import migrations

UUID = re.compile(r"^/courses/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")


def fix(apps, schema_editor):
    Notification = apps.get_model("notifications", "Notification")
    CourseOffering = apps.get_model("academic", "CourseOffering")
    rows = Notification.objects.filter(action_url__startswith="/courses/")
    for row in rows.iterator():
        match = UUID.match(row.action_url)
        if not match:
            continue
        pk = CourseOffering.objects.filter(public_id=match.group(1)).values_list("pk", flat=True)
        target = f"/courses/{pk[0]}" if pk else "/courses"
        Notification.objects.filter(pk=row.pk).update(action_url=target)


class Migration(migrations.Migration):
    dependencies = [
        ("notifications", "0004_fix_action_urls"),
        ("academic", "0004_notifications"),
    ]
    operations = [migrations.RunPython(fix, migrations.RunPython.noop)]
