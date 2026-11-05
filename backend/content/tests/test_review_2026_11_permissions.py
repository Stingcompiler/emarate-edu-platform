"""Announcements, media and the audit log by field of work after review 2026-11 axis 2 (the
probes are in docs/qa/evidence/review-2026-11/permissions): who changes what someone else
wrote, and what each role reads of the log."""

import io
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from academic.models import DepartmentMembership
from accounts.rbac import Role as R
from audit.models import AuditLog
from content.models import Announcement, Event, MediaAsset, SiteSettings, Status


def _published(author, *, scope="college", scope_id=None, audience="public", event=None):
    return Announcement.objects.create(
        scope=scope,
        scope_id=scope_id,
        audience=audience,
        title="إعلان",
        body="<p>نص</p>",
        status=Status.PUBLISHED,
        publish_at=timezone.now() - timedelta(hours=1),
        created_by=author,
        event=event,
    )


def _url(a):
    return f"/api/v1/announcements/{a.public_id}"


def test_the_events_manager_keeps_to_events_and_their_own(api, users):
    em = api(users[R.EVENTS_MANAGER])
    general = _published(users[R.SITE_MANAGER])
    assert em.patch(_url(general), {"title": "x"}, format="json").status_code == 403
    assert em.delete(_url(general)).status_code == 403
    now = timezone.now()
    event = Event.objects.create(
        slug="open-day",
        title="اليوم المفتوح",
        description="<p>.</p>",
        starts_at=now,
        ends_at=now + timedelta(hours=2),
        created_by=users[R.EVENTS_MANAGER],
    )
    about_event = _published(users[R.SITE_MANAGER], event=event)
    assert em.delete(_url(about_event)).status_code == 202  # a request since 2026-11-05
    own = _published(users[R.EVENTS_MANAGER])
    assert em.delete(_url(own)).status_code == 202  # a request since 2026-11-05
    # The site manager still removes any college announcement.
    assert api(users[R.SITE_MANAGER]).delete(_url(general)).status_code == 204


def test_academic_affairs_deletes_only_its_own_staff_announcements(api, users):
    aa = api(users[R.ACADEMIC_AFFAIRS])
    others = _published(users[R.SYSTEM_ADMIN], audience="staff")
    assert aa.delete(_url(others)).status_code == 403
    own = _published(users[R.ACADEMIC_AFFAIRS], audience="staff")
    assert aa.delete(_url(own)).status_code == 202  # a request since 2026-11-05


def test_two_roles_do_not_add_up_to_a_third_right(api, users, make_user, ba_dept):
    manager = make_user(R.DEPARTMENT_MANAGER, department=ba_dept)
    news = _published(manager, scope="department", scope_id=ba_dept.pk, audience="staff")
    both = make_user(R.ACADEMIC_AFFAIRS, R.TEACHER)
    DepartmentMembership.objects.create(user=both, department=ba_dept, kind="teacher")
    assert api(both).delete(_url(news)).status_code == 403
    assert api(manager).delete(_url(news)).status_code == 202  # a request since 2026-11-05


def _png():
    out = io.BytesIO()
    Image.new("RGB", (8, 8), "navy").save(out, "PNG")
    return SimpleUploadedFile("pic.png", out.getvalue(), "image/png")


def _media(client):
    response = client.post("/api/v1/content/media", {"file": _png()}, format="multipart")
    assert response.status_code == 201, response.data
    return MediaAsset.objects.get(public_id=response.data["public_id"])


def test_the_media_library_is_the_site_teams(api, users):
    sm, em = api(users[R.SITE_MANAGER]), api(users[R.EVENTS_MANAGER])
    logo = _media(sm)
    site = SiteSettings.load()
    site.logo = logo
    site.save()
    url = f"/api/v1/content/media/{logo.public_id}"
    assert em.patch(url, {"alt_ar": "x"}, format="json").status_code == 403
    assert em.delete(url).status_code == 403
    in_use = sm.delete(url)
    assert in_use.status_code == 409 and in_use.data["code"] == "in_use"
    own = _media(em)
    own_url = f"/api/v1/content/media/{own.public_id}"
    assert em.patch(own_url, {"alt_ar": "صورة الفعالية"}, format="json").status_code == 200
    assert em.delete(own_url).status_code == 204


def test_the_head_registrar_reads_admission_inquiries_and_status_changes(
    api, users, it_program, make_student
):
    from inquiries import services as inquiries

    general = inquiries.submit(
        name="زائر",
        email="v@x.test",
        phone="",
        type="general",
        department=None,
        subject="الرسوم",
        message="كم الرسوم؟",
    )
    admission = inquiries.submit(
        name="زائر",
        email="w@x.test",
        phone="",
        type="admission",
        department=None,
        subject="القبول",
        message="متى يبدأ التقديم؟",
    )
    record = make_student(it_program, "26-IT-0951")
    api(users[R.STUDENT_AFFAIRS]).post(
        f"/api/v1/students/{record.public_id}/status",
        {"status": "suspended", "reason": "قرار لجنة"},
        format="json",
    )
    rows = api(users[R.HEAD_REGISTRAR]).get("/api/v1/audit-logs?page_size=100").data["results"]
    seen = {(r["action"].split(".")[0], r["target_repr"]) for r in rows}
    assert ("inquiry", admission.reference_no) in seen
    assert ("inquiry", general.reference_no) not in seen
    assert any(r["action"] == "student.status" for r in rows)
    assert AuditLog.objects.filter(action__startswith="inquiry.", target_repr=general.reference_no)
