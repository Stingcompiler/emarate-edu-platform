"""QA probes — comprehensive review 2026-11, axis 2 (permissions vs docs/03 v2.3).

Each probe EXPECTS THE FAULTY BEHAVIOUR: a passing probe means the defect is reproduced.
When a defect is fixed, its probe fails; turn it into a regular test with the inverted
assertion (or delete it) in the fixing PR. Not part of the permission matrix.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from academic.models import DepartmentMembership
from accounts.rbac import Role
from audit.models import AuditLog
from content.models import Announcement, MediaAsset, SiteSettings, Status

R = Role
pytestmark = pytest.mark.django_db


def _published(author, *, scope="college", scope_id=None, audience="public", title="إعلان"):
    return Announcement.objects.create(
        scope=scope,
        scope_id=scope_id,
        audience=audience,
        title=title,
        body="<p>نص</p>",
        status=Status.PUBLISHED,
        publish_at=timezone.now() - timedelta(hours=1),
        created_by=author,
    )


def _png(name="logo.png"):
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "navy").save(buffer, "PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), "image/png")


# ─── D1 🟠 Events manager deletes/edits the site manager's general announcement ──────────
# docs/03 §3.13 + §7 «الحذف»: em deletes events («✔ فعاليات») and announces an event; the
# site manager owns the general public announcements. content/services.py `_college_grant`
# lets em address — and therefore, through `may_announce`/`may_delete_announcement`, edit and
# delete — ANY college public/all_internal announcement, event-linked or not, whoever wrote it.


def test_probe_d1_events_manager_deletes_site_managers_general_announcement(api, users):
    general = _published(users[R.SITE_MANAGER], title="مواعيد التسجيل")  # no event
    assert general.event_id is None
    em = api(users[R.EVENTS_MANAGER])
    url = f"/api/v1/announcements/{general.public_id}"
    edited = em.patch(url, {"title": "عدّله مدير الفعاليات"}, format="json")
    assert edited.status_code == 200  # faulty: not em's announcement, not about an event
    assert em.delete(url).status_code == 204  # faulty
    assert not Announcement.objects.filter(pk=general.pk).exists()


# ─── D2 🟠 Academic affairs deletes other authors' college staff announcements ───────────
# docs/03 §7 «الحذف»: aa deletes assignments only («تعيينات»); «إعلانات» aa ◐ أساتذة = may
# address teachers. `_college_grant` (audience staff, scope college/department) is reused for
# deletion, so aa deletes the system admin's or site manager's staff announcement.


def test_probe_d2_academic_affairs_deletes_admins_staff_announcement(api, users):
    notice = _published(users[R.SYSTEM_ADMIN], audience="staff", title="صيانة النظام")
    response = api(users[R.ACADEMIC_AFFAIRS]).delete(f"/api/v1/announcements/{notice.public_id}")
    assert response.status_code == 204  # faulty
    assert not Announcement.objects.filter(pk=notice.pk).exists()


# ─── D3 🟠 Role combination (R15 pattern): aa + teacher-member of another department ────
# AA alone cannot even see the BA department's staff announcement (404); a teacher who is a
# member of BA sees it but may not delete it (403). The same person holding both roles
# deletes it: visibility comes from the membership, the grant from AA's `_college_grant`.


def test_probe_d3_aa_plus_teacher_member_deletes_department_managers_announcement(
    api, users, make_user, ba_dept
):
    ba_manager = make_user(R.DEPARTMENT_MANAGER, department=ba_dept)
    news = _published(
        ba_manager, scope="department", scope_id=ba_dept.pk, audience="staff", title="اجتماع"
    )
    url = f"/api/v1/announcements/{news.public_id}"

    aa_only = make_user(R.ACADEMIC_AFFAIRS)
    assert api(aa_only).delete(url).status_code == 404

    teacher_only = make_user(R.TEACHER)
    DepartmentMembership.objects.create(user=teacher_only, department=ba_dept, kind="teacher")
    assert api(teacher_only).delete(url).status_code == 403

    both = make_user(R.ACADEMIC_AFFAIRS, R.TEACHER)
    DepartmentMembership.objects.create(user=both, department=ba_dept, kind="teacher")
    assert api(both).delete(url).status_code == 204  # faulty: neither role alone may
    assert not Announcement.objects.filter(pk=news.pk).exists()


# ─── D4 🟠 Events manager deletes and relabels any site media, the logo included ─────────
# content/views.py MediaAssetViewSet gates list/create/PATCH/DELETE on `events.manage`
# (sys, sm, em) with no ownership or «in use» check. docs/03 §3.13: em manages events and
# «صورها»; §3.12: the media library is the site manager's. Deleting the logo empties
# SiteSettings.logo (SET_NULL) and deletes the file.


def test_probe_d4_events_manager_deletes_the_site_logo(api, users):
    sm = api(users[R.SITE_MANAGER])
    uploaded = sm.post(
        "/api/v1/content/media", {"file": _png(), "alt_ar": "شعار الكلية"}, format="multipart"
    )
    assert uploaded.status_code == 201, uploaded.data
    logo = MediaAsset.objects.get(public_id=uploaded.data["public_id"])
    site = SiteSettings.load()
    site.logo = logo
    site.save()

    em = api(users[R.EVENTS_MANAGER])
    url = f"/api/v1/content/media/{logo.public_id}"
    assert em.patch(url, {"alt_ar": "x"}, format="json").status_code == 200  # faulty
    assert em.delete(url).status_code == 204  # faulty
    assert SiteSettings.load().logo_id is None


# ─── D5 🟢 Head registrar reads the audit trail of general inquiries ─────────────────────
# audit/views.py DOMAINS[HEAD_REGISTRAR] includes every "inquiry." action, but general
# inquiries (fees/general/technical/study) are the site manager's (docs/03 §3.12, §4) and the
# head registrar cannot see them in /inquiries (inquiries/services.visible_q).


def test_probe_d5_head_registrar_sees_general_inquiry_audit_entries(api, users):
    from inquiries import services as inquiries

    inquiry = inquiries.submit(
        name="زائر",
        email="visitor@x.test",
        phone="",
        type="general",
        department=None,
        subject="الرسوم",
        message="كم الرسوم؟",
    )
    head = api(users[R.HEAD_REGISTRAR])
    listed = {row["reference_no"] for row in head.get("/api/v1/inquiries").data["results"]}
    assert inquiry.reference_no not in listed  # not theirs …
    logged = head.get("/api/v1/audit-logs?page_size=100").data["results"]
    assert any(
        row["action"].startswith("inquiry.") and row["target_repr"] == inquiry.reference_no
        for row in logged
    )  # faulty: … yet its audit trail is


# ─── D6 🟢 Head registrar cannot see who changed a student's status ──────────────────────
# docs/03 §3.14: a suspension updates StudentRecord.status «بالتنسيق مع مسؤول المسجلين الذي
# يرى التغيير ومصدره». The change is logged as "student.status" (singular); the head
# registrar's domain covers "students." only, and the student serializer carries no source.


def test_probe_d6_head_registrar_does_not_see_status_change_source(
    api, users, it_program, make_student
):
    record = make_student(it_program, "26-IT-0950")
    done = api(users[R.STUDENT_AFFAIRS]).post(
        f"/api/v1/students/{record.public_id}/status",
        {"status": "suspended", "reason": "قرار لجنة"},
        format="json",
    )
    assert done.status_code == 200, done.data
    assert AuditLog.objects.filter(action="student.status").exists()
    head = api(users[R.HEAD_REGISTRAR])
    actions = {
        row["action"] for row in head.get("/api/v1/audit-logs?page_size=100").data["results"]
    }
    assert "student.status" not in actions  # faulty per §3.14
    assert head.get(f"/api/v1/students/{record.public_id}").data["status"] == "suspended"


# ─── D7 (difference) Site manager cannot read cycles/intakes; docs/03 §7 says 👁 ───────────
# §7 «دورات القبول/البرامج المفتوحة»: sm 👁. accounts/rbac.py "admissions.view" leaves sm out.


def test_probe_d7_site_manager_cannot_read_intakes(api, users):
    sm = api(users[R.SITE_MANAGER])
    assert sm.get("/api/v1/intakes").status_code == 403  # differs from docs/03 §7
    assert sm.get("/api/v1/admission-cycles").status_code == 403
