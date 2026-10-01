import io

import pytest
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from academic.models import Enrollment
from accounts.models import RoleAssignment
from accounts.rbac import Role
from organization.models import Department, Program
from students.models import StudentRecord

PASSWORD = "Demo-pass-2026"


def _seed():
    call_command("seed_demo", stdout=io.StringIO())


def test_refuses_without_debug(db, settings, monkeypatch):
    settings.DEBUG = False
    monkeypatch.setenv("DEMO_PASSWORD", PASSWORD)
    with pytest.raises(CommandError, match="DEBUG"):
        _seed()


def test_refuses_without_password(db, settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    with pytest.raises(CommandError, match="DEMO_PASSWORD"):
        _seed()


def test_seed_is_complete_and_idempotent(db, settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.setenv("DEMO_PASSWORD", PASSWORD)
    _seed()
    counts = (Program.objects.count(), StudentRecord.objects.count(), Enrollment.objects.count())
    _seed()
    again = (Program.objects.count(), StudentRecord.objects.count(), Enrollment.objects.count())
    assert again == counts
    assert Department.objects.count() == 4
    # Sample site content: each piece says it is an example, and a rerun adds nothing.
    from content.models import MediaAsset, News, Page, SiteSettings

    site = SiteSettings.load()
    assert site.licence_ar.startswith("(مثال)") and site.hero_image_id and site.share_image_id
    assert all(f["label_ar"].startswith("(مثال)") for f in site.figures)
    assert MediaAsset.objects.exclude(alt_ar__startswith="(مثال) صورة تجريبية").count() == 0
    assert all(
        n.title.startswith("(مثال)") for n in News.objects.filter(slug__startswith="sample-")
    )
    gallery = Page.objects.get(slug="gallery").blocks
    assert sum(b["type"] == "image" for b in gallery) == 6
    assert all(p.description_ar.startswith("(مثال)") for p in Program.objects.all())
    pictures = MediaAsset.objects.count()
    _seed()
    assert MediaAsset.objects.count() == pictures
    assert counts[:2] == (11, 40)
    assert set(RoleAssignment.objects.values_list("role", flat=True)) == set(Role)

    client = APIClient()
    login = client.post(
        "/api/v1/auth/login", {"identifier": "student@demo.ecst.test", "password": PASSWORD}
    )
    assert login.status_code == 200
    codes = {course["code"] for course in client.get("/api/v1/me/courses").data}
    assert {"IT101", "IT100", "MATH101"} <= codes
    assert "IT201" not in codes  # level 2
    lectures = client.get("/api/v1/lectures").data["count"]
    assignments = client.get("/api/v1/assignments").data["count"]
    assert lectures >= 2 and assignments >= 1
