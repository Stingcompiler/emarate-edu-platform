import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

OLD = "كلية الإمارات للعلوم والتقنية"
NEW = "كلية الإمارات للعلوم والتكنولوجيا"


@pytest.mark.django_db(transaction=True)
def test_the_official_name_replaces_the_old_default_only():
    """Owner decision 2026-10-04: stored copies of the old default follow the new name; a
    name typed differently is kept."""
    executor = MigrationExecutor(connection)
    executor.migrate([("content", "0006_page_image_layout")])
    apps = executor.loader.project_state(
        [("content", "0006_page_image_layout"), ("organization", "0005_program_public_facts")]
    ).apps
    apps.get_model("content", "SiteSettings").objects.update_or_create(
        pk=1, defaults={"name_ar": OLD}
    )
    College = apps.get_model("organization", "College")
    College.objects.create(code="A", name_ar=OLD)
    College.objects.create(code="B", name_ar="اسم آخر")

    executor = MigrationExecutor(connection)
    executor.migrate([("content", "0007_official_name")])
    apps = executor.loader.project_state(
        [("content", "0007_official_name"), ("organization", "0005_program_public_facts")]
    ).apps
    assert apps.get_model("content", "SiteSettings").objects.get(pk=1).name_ar == NEW
    names = dict(apps.get_model("organization", "College").objects.values_list("code", "name_ar"))
    assert names == {"A": NEW, "B": "اسم آخر"}
