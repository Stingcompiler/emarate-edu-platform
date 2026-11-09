"""Medicine is a five-year programme, like engineering (owner, 2026-11-09: «عند اختيار تخصص
هندسة أو طب يظهر المستوى الخامس — فصل 9 أو 10»). The college entered it with four levels;
raising it only adds level 5 (semesters 9–10), nothing already stored becomes invalid."""

from django.db import migrations

MEDICINE = ["MBBS"]


def five_levels(apps, schema_editor):
    Program = apps.get_model("organization", "Program")
    Program.objects.filter(code__in=MEDICINE, levels_count__lt=5).update(
        levels_count=5, duration_terms=10
    )


class Migration(migrations.Migration):
    dependencies = [("organization", "0006_duration_follows_levels")]

    operations = [migrations.RunPython(five_levels, migrations.RunPython.noop)]
