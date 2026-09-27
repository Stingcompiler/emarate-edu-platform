from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from accounts.rbac import Role
from content.models import Announcement

A = "/api/v1/announcements"


@pytest.fixture
def site(make_user):
    return make_user(Role.SITE_MANAGER)


def _png():
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (8, 4), "navy").save(buffer, "PNG")
    return SimpleUploadedFile("cover.png", buffer.getvalue(), "image/png")


def test_pages_are_sanitized_and_public_when_published(api, site, make_user):
    body = {
        "slug": "about",
        "title_ar": "عن الكلية",
        "status": "draft",
        "blocks": [
            {
                "type": "html",
                "html": (
                    '<p onclick="x()">مرحبًا<script>alert(1)</script></p>'
                    '<a href="javascript:x">x</a>'
                ),
            },
            {"type": "evil", "html": "<b>no</b>"},
        ],
    }
    assert (
        api(make_user(Role.EVENTS_MANAGER))
        .post("/api/v1/content/pages", body, format="json")
        .status_code
        == 403
    )
    page = api(site).post("/api/v1/content/pages", body, format="json")
    assert page.status_code == 201, page.data
    html = page.data["blocks"][0]["html"]
    assert "script" not in html and "onclick" not in html and "javascript" not in html
    assert len(page.data["blocks"]) == 1
    assert api().get("/api/public/pages/about").status_code == 404
    api(site).patch(
        f"/api/v1/content/pages/{page.data['public_id']}", {"status": "published"}, format="json"
    )
    public = api().get("/api/public/pages/about")
    assert public.status_code == 200 and "max-age=60" in public["Cache-Control"]


def test_announcement_scopes_and_feed(api, classroom, make_user, it_dept, ba_dept, site):
    body = {
        "scope": "offering",
        "scope_id": classroom.offering.pk,
        "audience": "students",
        "title": "تأجيل المحاضرة",
        "body": "<p>غدًا</p>",
    }
    assert api(classroom.student).post(A, body, format="json").status_code == 403
    created = api(classroom.teacher).post(A, body, format="json")
    assert created.status_code == 201, created.data
    assert api(classroom.ta).post(A, body, format="json").status_code == 403  # TA needs permission
    assert api(classroom.student).get(A).data["count"] == 0  # still a draft
    api(classroom.teacher).post(f"{A}/{created.data['public_id']}/publish")
    assert api(classroom.student).get(A).data["count"] == 1
    other = make_user(Role.STUDENT)
    assert api(other).get(A).data["count"] == 0

    dept = {
        "scope": "department",
        "scope_id": it_dept.pk,
        "audience": "all_internal",
        "title": "اجتماع القسم",
        "body": "x",
    }
    assert (
        api(make_user(Role.DEPARTMENT_MANAGER, department=ba_dept))
        .post(A, dept, format="json")
        .status_code
        == 403
    )
    assert (
        api(make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept))
        .post(A, dept, format="json")
        .status_code
        == 201
    )
    public = {
        "scope": "college",
        "audience": "public",
        "title": "بدء التسجيل",
        "body": "<p>مرحبًا</p>",
    }
    assert api(classroom.teacher).post(A, public, format="json").status_code == 403
    news = api(site).post(A, public, format="json").data
    api(site).post(f"{A}/{news['public_id']}/publish")
    assert [a["title"] for a in api().get("/api/public/announcements").data] == ["بدء التسجيل"]
    Announcement.objects.filter(public_id=news["public_id"]).update(
        expires_at=timezone.now() - timedelta(minutes=1)
    )
    assert api().get("/api/public/announcements").data == []
    public_dept = {**dept, "audience": "public"}
    assert api(site).post(A, public_dept, format="json").status_code == 400


def test_events_media_menus_redirects_settings(api, site, make_user, settings):
    events = make_user(Role.EVENTS_MANAGER)
    cover = api(events).post(
        "/api/v1/content/media", {"file": _png(), "alt_ar": "غلاف"}, format="multipart"
    )
    assert cover.status_code == 201, cover.data
    assert cover.data["width"] == 8 and cover.data["url"]
    bad = api(events).post(
        "/api/v1/content/media", {"file": SimpleUploadedFile("x.exe", b"MZ")}, format="multipart"
    )
    assert bad.status_code == 400
    now = timezone.now()
    event = {
        "slug": "open-day",
        "title": "اليوم المفتوح",
        "description": "<p>أهلًا</p>",
        "starts_at": (now + timedelta(days=3)).isoformat(),
        "ends_at": (now + timedelta(days=3, hours=4)).isoformat(),
        "cover": cover.data["public_id"],
        "status": "published",
    }
    assert api(events).post("/api/v1/content/events", event, format="json").status_code == 201
    assert (
        api(events)
        .post("/api/v1/content/news", {"slug": "n", "title": "t", "body": "b"}, format="json")
        .status_code
        == 403
    )
    listed = api().get("/api/public/events").data
    assert listed[0]["slug"] == "open-day" and listed[0]["cover_url"]
    menu = [
        {"label_ar": "الرئيسية", "url": "/", "order": 1},
        {"label_ar": "القبول", "url": "/admissions", "order": 2},
    ]
    assert api(site).put("/api/v1/content/menus/header", menu, format="json").status_code == 200
    assert (
        api(site)
        .put(
            "/api/v1/content/menus/header",
            [{"label_ar": "x", "url": "javascript:1"}],
            format="json",
        )
        .status_code
        == 400
    )
    assert [i["label_ar"] for i in api().get("/api/public/menus/header").data["items"]] == [
        "الرئيسية",
        "القبول",
    ]
    assert (
        api(site)
        .post("/api/v1/content/redirects", {"from_path": "/old", "to_path": "/new"})
        .status_code
        == 201
    )
    assert api().get("/api/public/redirects", {"path": "/old"}).data["to_path"] == "/new"
    assert (
        api(site)
        .patch("/api/v1/content/site-settings", {"phone": "+249 91 234 5678"}, format="json")
        .status_code
        == 200
    )
    assert api().get("/api/public/site").data["phone"] == "+249 91 234 5678"


def test_publishing_asks_for_one_debounced_rebuild(api, site, settings, monkeypatch):
    from content import tasks

    settings.SITE_REBUILD_HOOK_URL = "https://api.example.test/deploy-hook"
    calls = []
    monkeypatch.setattr(tasks.trigger_site_rebuild, "apply_async", lambda **kw: calls.append(kw))
    for slug in ("a", "b", "c"):
        api(site).post(
            "/api/v1/content/news",
            {"slug": slug, "title": slug, "body": "x", "status": "published"},
            format="json",
        )
    assert calls == [{"countdown": 120}]


def test_archive_announcement(api, site):
    body = {"scope": "college", "audience": "all_internal", "title": "t", "body": "b"}
    created = api(site).post(A, body, format="json").data
    api(site).post(f"{A}/{created['public_id']}/publish")
    assert api(site).post(f"{A}/{created['public_id']}/archive").data["status"] == "archived"
