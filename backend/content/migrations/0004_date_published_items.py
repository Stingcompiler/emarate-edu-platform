"""News and pages published from the editor had no publish date (fixed in content.views);
give them the time they were last saved so the site can show and sort them."""

from django.db import migrations
from django.db.models import F


def backfill(apps, schema_editor):
    for model in ("News", "Page"):
        apps.get_model("content", model).objects.filter(
            status="published", publish_at__isnull=True
        ).update(publish_at=F("updated_at"))


class Migration(migrations.Migration):
    dependencies = [("content", "0003_page_paths")]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
