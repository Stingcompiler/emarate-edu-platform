"""«الكوادر» (owner, 2026-10-30): staff enter their degrees and may let their photo appear on
the site; it is published as entered, and academic affairs may hide a photo or a degree."""

import io

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from academic.models import DepartmentMembership
from accounts.rbac import Role
from audit.models import AuditLog


def _photo(client) -> str:
    out = io.BytesIO()
    Image.new("RGB", (800, 800), (90, 60, 40)).save(out, "PNG")
    up = client.post(
        "/api/v1/files",
        {"purpose": "photo", "file": SimpleUploadedFile("me.png", out.getvalue(), "image/png")},
        format="multipart",
    )
    assert up.status_code == 201, up.data
    assert (
        client.patch("/api/v1/me", {"photo": up.data["public_id"]}, format="json").status_code
        == 200
    )
    return up.data["public_id"]


def test_staff_degrees_and_photo_on_the_site_with_consent(api, it_dept, make_user):
    teacher_user = make_user(Role.TEACHER, full_name_ar="د. سلمى")
    DepartmentMembership.objects.create(department=it_dept, user=teacher_user, kind="teacher")
    teacher = api(teacher_user)
    mine = "/api/v1/me/qualifications"
    master = teacher.post(
        mine,
        {"degree": "master", "field": "علوم الحاسوب", "institution": "جامعة الخرطوم", "year": 2012},
        format="json",
    )
    assert master.status_code == 201, master.data
    phd = teacher.post(
        mine,
        {
            "degree": "phd",
            "field": "الذكاء الاصطناعي",
            "institution": "جامعة ماليزيا",
            "year": 2018,
        },
        format="json",
    )
    assert [q["degree"] for q in teacher.get(mine).data] == ["phd", "master"]
    assert (
        teacher.patch(f"{mine}/{master.data['id']}", {"year": 2013}, format="json").data["year"]
        == 2013
    )
    assert AuditLog.objects.filter(action="profile.qualification_add").count() == 2
    # Students do not appear on the site; another member cannot touch these.
    assert (
        api(make_user(Role.STUDENT))
        .post(mine, {"degree": "phd", "field": "x", "institution": "y"}, format="json")
        .status_code
        == 403
    )
    other = api(make_user(Role.TEACHER))
    assert other.delete(f"{mine}/{phd.data['id']}").status_code == 404

    photo = _photo(teacher)
    url = f"/api/public/departments/{it_dept.code}"
    teacher.patch(
        "/api/v1/me/public-profile",
        {"public_profile": True, "research_interests": "تعلم الآلة"},
        format="json",
    )
    cache.clear()
    [member] = api().get(url).data["faculty"]
    assert member["photo"] is None  # no consent for the photo yet
    assert [q["degree_ar"] for q in member["qualifications"]] == ["دكتوراه", "ماجستير"]
    assert member["research_interests"] == "تعلم الآلة"
    public_photo = f"/api/public/staff-photos/{teacher_user.public_id}.webp"
    assert api().get(public_photo).status_code == 404

    teacher.patch("/api/v1/me/public-profile", {"public_photo": True}, format="json")
    cache.clear()
    [member] = api().get(url).data["faculty"]
    assert member["photo"].endswith(f"/api/public/staff-photos/{teacher_user.public_id}.webp")
    shown = api().get(public_photo)
    assert shown.status_code == 200 and shown["Content-Type"] == "image/webp"
    assert photo

    # Academic affairs reviews and hides; a teacher cannot.
    moderator = api(make_user(Role.ACADEMIC_AFFAIRS))
    listed = moderator.get("/api/v1/staff-profiles")
    assert listed.status_code == 200 and listed.data[0]["full_name_ar"] == "د. سلمى"
    assert teacher.get("/api/v1/staff-profiles").status_code == 403
    hide = f"/api/v1/staff-profiles/{teacher_user.public_id}/photo"
    assert other.patch(hide, {"hidden": True}, format="json").status_code == 403
    assert moderator.patch(hide, {"hidden": True}, format="json").status_code == 204
    assert (
        moderator.patch(
            f"/api/v1/qualifications/{master.data['id']}/visibility",
            {"hidden": True},
            format="json",
        ).status_code
        == 204
    )
    cache.clear()
    [member] = api().get(url).data["faculty"]
    assert member["photo"] is None and [q["degree"] for q in member["qualifications"]] == ["phd"]
    assert api().get(public_photo).status_code == 404
    assert AuditLog.objects.filter(action="profile.photo_moderate").exists()
    assert teacher.delete(f"{mine}/{phd.data['id']}").status_code == 204
