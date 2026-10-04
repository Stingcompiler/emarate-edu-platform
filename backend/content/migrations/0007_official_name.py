from django.db import migrations, models

OLD = "كلية الإمارات للعلوم والتقنية"
NEW = "كلية الإمارات للعلوم والتكنولوجيا"


def rename(apps, schema_editor, old=OLD, new=NEW):
    """The official name (owner decision 2026-10-04): stored copies that still hold the old
    default follow; a name the site manager typed differently is left alone."""
    apps.get_model("content", "SiteSettings").objects.filter(name_ar=old).update(name_ar=new)
    apps.get_model("organization", "College").objects.filter(name_ar=old).update(name_ar=new)


def unrename(apps, schema_editor):
    rename(apps, schema_editor, old=NEW, new=OLD)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0006_page_image_layout"),
        ("organization", "0005_program_public_facts"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sitesettings",
            name="name_ar",
            field=models.CharField(default=NEW, max_length=200),
        ),
        migrations.RunPython(rename, unrename),
    ]
