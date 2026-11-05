"""A course's semester is 1 or 2 (owner, 2026-11-05: two semesters per level, no summer)."""

from django.db import migrations, models


def clamp(apps, schema_editor):
    Course = apps.get_model("academic", "Course")
    Course.objects.exclude(default_term_order__in=(1, 2)).update(default_term_order=1)


class Migration(migrations.Migration):
    dependencies = [("academic", "0004_notifications")]

    operations = [
        migrations.RunPython(clamp, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.CheckConstraint(
                condition=models.Q(("default_term_order__gte", 1), ("default_term_order__lte", 2)),
                name="course_semester_range",
            ),
        ),
    ]
