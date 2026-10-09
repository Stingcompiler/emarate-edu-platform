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
        "slug": "open-day",
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
    assert api().get("/api/public/pages/open-day").status_code == 404
    api(site).patch(
        f"/api/v1/content/pages/{page.data['public_id']}", {"status": "published"}, format="json"
    )
    public = api().get("/api/public/pages/open-day")
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
    # One course's announcements, filtered by the server (review 2026-09-29, P3).
    one = {"scope": "offering", "scope_id": classroom.offering.pk}
    assert api(classroom.student).get(A, one).data["count"] == 1
    assert (
        api(classroom.student)
        .get(A, {**one, "scope_id": classroom.offering.pk + 1000})
        .data["count"]
        == 0
    )
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
    # A department's public news is its manager's to publish (owner 2026-09-30), not the
    # site team's; a programme or course can't be public at all.
    public_dept = {**dept, "audience": "public"}
    assert api(site).post(A, public_dept, format="json").status_code == 403


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
    groups = [
        {
            "label_ar": "القبول",
            "label_en": "Admissions",
            "url": "",
            "children": [
                {"label_ar": "التقديم", "url": "/admissions"},
                {"label_ar": "الرسوم", "url": "/admissions/fees"},
            ],
        },
        {"label_ar": "تواصل", "url": "/contact"},
    ]
    assert api(site).put("/api/v1/content/menus/header", groups, format="json").status_code == 200
    items = api().get("/api/public/menus/header").data["items"]
    assert [(i["label_ar"], [c["url"] for c in i["children"]]) for i in items] == [
        ("القبول", ["/admissions", "/admissions/fees"]),
        ("تواصل", []),
    ]
    for bad in (
        [{"label_ar": "x", "url": "//evil.example"}],  # protocol-relative: off-site
        [{"label_ar": "مجموعة فارغة", "url": "", "children": []}],
        [{"label_ar": "g", "url": "", "children": [{"label_ar": "x", "url": ""}]}],
    ):
        assert api(site).put("/api/v1/content/menus/header", bad, format="json").status_code == 400
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


def test_public_events_keep_past_ones_reachable(api, make_user):
    """Upcoming by default; ?past=1 lists ended events so their pages survive (docs/07 §1)."""
    from datetime import timedelta

    from django.utils import timezone

    from content.models import Event

    host = make_user(Role.EVENTS_MANAGER)
    now = timezone.now()
    for slug, days in (("soon", 5), ("done", -5)):
        Event.objects.create(
            slug=slug,
            title=slug,
            description="<p>x</p>",
            starts_at=now + timedelta(days=days),
            ends_at=now + timedelta(days=days, hours=2),
            status=Event.EventStatus.PUBLISHED,
            created_by=host,
        )
    assert [e["slug"] for e in api().get("/api/public/events").data] == ["soon"]
    assert [e["slug"] for e in api().get("/api/public/events?past=1").data] == ["done"]


@pytest.mark.django_db
def test_the_site_starts_with_default_menus(api):
    """A fresh install has the official structure (docs/07 §1); the site hides unbuilt pages."""
    header = api().get("/api/public/menus/header").data["items"]
    assert [i["label_ar"] for i in header][:3] == ["عن الكلية", "الأكاديمية", "القبول"]
    assert {c["url"] for i in header for c in i["children"]} >= {"/programs", "/about/dean"}
    footer = api().get("/api/public/menus/footer").data["items"]
    assert all(i["children"] for i in footer)


@pytest.mark.django_db
def test_official_pages_start_as_drafts_and_go_live_at_their_path(api, site):
    """docs/07 §1: every official page exists from the first deploy, but only as a draft
    with writing guidance — the college publishes its own text (content/official.py)."""
    from content.official import OFFICIAL_PAGES

    listed = {
        p["slug"]: p for p in api(site).get("/api/v1/content/pages?page_size=100").data["results"]
    }
    assert {o.slug for o in OFFICIAL_PAGES} <= set(listed)
    dean = listed["about/dean"]
    assert dean["status"] == "draft" and dean["official"] and dean["path"] == "about/dean"
    assert api().get("/api/public/pages").data == []  # nothing public before publishing
    assert api().get("/api/public/pages/about/dean").status_code == 404

    url = f"/api/v1/content/pages/{dean['public_id']}"
    assert api(site).patch(url, {"slug": "dean"}, format="json").status_code == 400  # fixed
    assert api(site).patch(url, {"status": "published"}, format="json").status_code == 200
    assert api().get("/api/public/pages/about/dean").data["title_ar"] == "كلمة العميد"
    free = api(site).post(
        "/api/v1/content/pages",
        {"slug": "open-day-2026", "title_ar": "يوم مفتوح", "status": "published"},
        format="json",
    )
    assert free.status_code == 201 and free.data["path"] == "p/open-day-2026"
    assert {p["slug"]: p["path"] for p in api().get("/api/public/pages").data} == {
        "about/dean": "about/dean",
        "open-day-2026": "p/open-day-2026",
    }
    bad = {"title_ar": "x"}
    for slug in ("a/b/c", "/lead", "a b"):
        response = api(site).post("/api/v1/content/pages", {**bad, "slug": slug}, format="json")
        assert response.status_code == 400, slug


@pytest.mark.django_db
def test_publishing_from_the_editor_dates_the_news(api, site):
    """The site shows and sorts news by publish_at; saving as published must set it."""
    created = api(site).post(
        "/api/v1/content/news",
        {"slug": "lab", "title": "افتتاح المعمل", "body": "<p>نص</p>", "status": "published"},
        format="json",
    )
    assert created.status_code == 201 and created.data["publish_at"]
    draft = api(site).post(
        "/api/v1/content/news",
        {"slug": "later", "title": "لاحقًا", "body": "<p>x</p>"},
        format="json",
    )
    assert draft.data["publish_at"] is None  # drafts stay undated
    url = f"/api/v1/content/news/{draft.data['public_id']}"
    assert api(site).patch(url, {"status": "published"}, format="json").data["publish_at"]
    assert [n["slug"] for n in api().get("/api/public/news").data] == ["later", "lab"]


def test_trust_signals_in_site_settings(api, site):
    """Review 2026-09-30 (PR 6a): the college sets its own figures, licence, hours and images."""
    image = api(site).post(
        "/api/v1/content/media", {"file": _png(), "alt_ar": "الحرم"}, format="multipart"
    )
    body = {
        "founded_year": 2005,
        "licence_ar": "مرخّصة من وزارة التعليم العالي — القرار 12 لسنة 2005",
        "licence_url": "/ar/about/accreditation/",
        "figures": [
            {"value": "1,200+", "label_ar": "خريج", "label_en": "graduates"},
            {"value": "", "label_ar": "فارغ"},  # dropped
        ],
        "office_hours_ar": "الأحد–الخميس 8:00–15:00",
        "hero_image": image.data["public_id"],
        "share_image": image.data["public_id"],
        "logo": image.data["public_id"],
    }
    assert api().get("/api/public/site").data["logo_url"] is None  # the built-in mark until set
    saved = api(site).patch("/api/v1/content/site-settings", body, format="json")
    assert saved.status_code == 200, saved.data
    public = api().get("/api/public/site").data
    assert public["founded_year"] == 2005
    assert public["figures"] == [{"value": "1,200+", "label_ar": "خريج", "label_en": "graduates"}]
    assert public["hero_image_url"].startswith("http") and public["hero_image_alt_ar"] == "الحرم"
    assert public["share_image_url"]
    # The logo is the owner's to change (2026-10-09): the site and the portal read logo_url.
    assert public["logo_url"].startswith("http") and public["logo_url"] == public["hero_image_url"]
    cleared = api(site).patch("/api/v1/content/site-settings", {"logo": None}, format="json")
    assert cleared.status_code == 200 and cleared.data["logo_url"] is None
    for bad in (
        {"founded_year": 1500},
        {"licence_url": "//evil.example"},
        {"figures": [{"value": str(i), "label_ar": "x"} for i in range(7)]},
    ):
        assert (
            api(site).patch("/api/v1/content/site-settings", bad, format="json").status_code == 400
        )


def test_image_blocks_accept_our_public_media_only(settings):
    """The image picker links the public media storage; other http hosts are dropped."""
    from content.sanitize import clean_blocks

    settings.STORAGES = {
        **settings.STORAGES,
        "public": {
            **settings.STORAGES["public"],
            "OPTIONS": {"base_url": "http://localhost:8000/media/public/"},
        },
    }
    ours = "http://localhost:8000/media/public/media/2026/10/a.jpg"
    blocks = clean_blocks(
        [
            {"type": "image", "url": ours, "alt": "x"},
            {"type": "image", "url": "http://evil.test/a.jpg", "alt": "x"},
            {"type": "image", "url": "http://localhost:8000/media/public/../private/a", "alt": "x"},
        ]
    )
    assert [b.get("url") for b in blocks] == [ours, None, None]


def test_image_layout_is_chosen_by_the_page_editors(api, site, make_user):
    """«عرض الصور»: one per row or a grid, set by the site manager or the system admin."""
    from audit.models import AuditLog
    from content.models import Page

    body = {"slug": "labs", "title_ar": "المعامل", "status": "published", "blocks": []}
    created = api(site).post("/api/v1/content/pages", body, format="json").data
    assert created["image_layout"] == "single"
    url = f"/api/v1/content/pages/{created['public_id']}"
    assert api(site).patch(url, {"image_layout": "grid"}, format="json").status_code == 200
    assert api().get("/api/public/pages/labs").data["image_layout"] == "grid"
    log = AuditLog.objects.filter(action="page.update").latest("id")
    assert log.old["image_layout"] == "single" and log.new["image_layout"] == "grid"
    assert api(site).patch(url, {"image_layout": "mosaic"}, format="json").status_code == 400
    admin = make_user(Role.SYSTEM_ADMIN)
    assert api(admin).patch(url, {"image_layout": "single"}, format="json").status_code == 200
    events = make_user(Role.EVENTS_MANAGER)
    assert api(events).patch(url, {"image_layout": "grid"}, format="json").status_code == 403
    # The gallery's system draft starts as a grid.
    assert Page.objects.get(slug="gallery").image_layout == "grid"


def test_deleting_announcements_is_narrower_than_writing_them(api, classroom, make_user, it_dept):
    """docs/03 §3.7, §3.9: a supervisor or a TA never deletes; a teacher deletes their own
    course announcement; publishing re-checks the author's authority today."""
    from academic.models import OfferingInstructor

    dept = {"scope": "department", "scope_id": it_dept.pk, "audience": "all_internal"}
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    made = api(supervisor).post(A, {**dept, "title": "t", "body": "b"}, format="json").data
    assert api(supervisor).delete(f"{A}/{made['public_id']}").status_code == 403
    api(supervisor).post(f"{A}/{made['public_id']}/publish")  # the manager sees it once published
    assert api(manager).delete(f"{A}/{made['public_id']}").status_code == 204

    classroom.offering.ta_can_notify = True
    classroom.offering.save(update_fields=["ta_can_notify"])
    course = {"scope": "offering", "scope_id": classroom.offering.pk, "audience": "students"}
    by_ta = api(classroom.ta).post(A, {**course, "title": "t", "body": "b"}, format="json").data
    assert api(classroom.ta).delete(f"{A}/{by_ta['public_id']}").status_code == 403
    by_teacher = api(classroom.teacher).post(
        A, {**course, "title": "t", "body": "b"}, format="json"
    )
    assert api(classroom.teacher).delete(f"{A}/{by_teacher.data['public_id']}").status_code == 204

    draft = (
        api(classroom.teacher).post(A, {**course, "title": "t", "body": "b"}, format="json").data
    )
    OfferingInstructor.objects.filter(offering=classroom.offering, user=classroom.teacher).delete()
    assert api(classroom.teacher).post(f"{A}/{draft['public_id']}/publish").status_code == 403
    assert Announcement.objects.get(public_id=draft["public_id"]).status == "draft"


def test_department_announcements_reach_the_departments_log(api, make_user, it_dept):
    from audit.models import AuditLog

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    body = {"scope": "department", "scope_id": it_dept.pk, "audience": "students"}
    made = api(manager).post(A, {**body, "title": "t", "body": "b"}, format="json").data
    api(manager).post(f"{A}/{made['public_id']}/publish")
    rows = AuditLog.objects.filter(action__startswith="announcement.")
    assert {r.department_id for r in rows} == {it_dept.pk} and rows.count() == 2
