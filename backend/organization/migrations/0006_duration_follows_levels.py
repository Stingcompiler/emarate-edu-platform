"""A programme's semesters are twice its levels (owner, 2026-11-07: two semesters a level)."""

from django.db import migrations
from django.db.models import F


def twice_the_levels(apps, schema_editor):
    Program = apps.get_model("organization", "Program")
    Program.objects.update(duration_terms=F("levels_count") * 2)


class Migration(migrations.Migration):
    dependencies = [("organization", "0005_program_public_facts")]

    operations = [migrations.RunPython(twice_the_levels, migrations.RunPython.noop)]
