"""QA probes, review 2026-11 §1.3 (profile photos and «الكوادر»).

READ-AND-PROVE phase: every test here EXPECTS THE FAULTY BEHAVIOUR. A passing test means the
defect is reproduced on the current code; once a fix lands, flip the assertion and keep the
test as a regression test (review plan §1 rule 1).
"""

import io
import warnings
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import EpsImagePlugin, Image

from academic.models import DepartmentMembership
from accounts.models import RoleAssignment
from accounts.rbac import Role
from files import validation


def _png(width=600, height=600, mode="RGB") -> bytes:
    out = io.BytesIO()
    fill = 0 if mode in ("1", "L") else (40, 90, 160)
    Image.new(mode, (width, height), fill).save(out, "PNG")
    return out.getvalue()


def _upload(client, name: str, content: bytes, content_type: str = "image/png"):
    return client.post(
        "/api/v1/files",
        {"purpose": "photo", "file": SimpleUploadedFile(name, content, content_type)},
        format="multipart",
    )


# A ".webp" whose bytes 8..11 read "WEBP" (all that files/validation.py checks for webp — not
# the "RIFF" at offset 0), but which is in fact an EPS (PostScript) document.
EPS_AS_WEBP = (
    b"%!PS    WEBP\n"
    b"%!PS-Adobe-3.0 EPSF-3.0\n"
    b"%%BoundingBox: 0 0 16 16\n"
    b"%%EndComments\n"
    b"(attacker-controlled PostScript runs here) pop\n"
    b"showpage\n"
)


def test_probe_webp_signature_lets_postscript_reach_ghostscript(api, make_user):
    """DEFECT: format confusion. validation.check accepts EPS bytes named .webp, and
    accounts/photos.normalize opens them with Image.open(...) without `formats=`, so Pillow picks
    its EPS plugin and image.convert() hands the attacker's PostScript to Ghostscript (`gs`).
    Locally gs is absent (the upload then fails with 400); on a server where Ghostscript is
    installed the PostScript is executed. Ghostscript is stubbed here to prove it is reached."""
    upload = SimpleUploadedFile("me.webp", EPS_AS_WEBP, "image/webp")
    assert validation.check(upload, allowed={"webp"}, max_mb=3).mime == "image/webp"
    with Image.open(io.BytesIO(EPS_AS_WEBP)) as opened:
        assert opened.format == "EPS"

    calls = []

    def fake_ghostscript(tile, size, fp, scale=1, transparency=False):
        fp.seek(0)
        calls.append(fp.read())
        return Image.new("RGB", size).im

    with mock.patch.object(EpsImagePlugin, "Ghostscript", fake_ghostscript):
        response = _upload(api(make_user(Role.STUDENT)), "me.webp", EPS_AS_WEBP, "image/webp")
    assert response.status_code == 201, response.data
    assert calls and b"attacker-controlled PostScript" in calls[0]


def test_probe_decompression_bomb_below_pillow_hard_limit_is_decoded(api, make_user):
    """DEFECT: only Pillow's default guard applies (no MAX_IMAGE_PIXELS, no dimension check in
    files/validation.py or accounts/photos.py). Pillow *errors* only above 2 x 89,478,485 px;
    between 89.5 M and 179 M px it merely warns and decodes the whole bitmap. An ~11 KB PNG of
    9,500 x 9,500 px (90.25 M px) is accepted from any signed-in user and fully decoded
    (measured: peak RSS of the test process rises by ~410 MB); near 13,000 x 13,000 RGBA a
    single upload costs over 1 GB of worker memory. The 20,000 x 20,000 case is refused
    (verified)."""
    bomb = _png(9_500, 9_500, mode="1")
    assert len(bomb) < 64 * 1024  # tiny on the wire, far under the 3 MB limit
    assert Image.MAX_IMAGE_PIXELS < 9_500 * 9_500  # over Pillow's warning threshold
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        response = _upload(api(make_user(Role.STUDENT)), "big.png", bomb)
    assert response.status_code == 201, response.data
    assert any(w.category is Image.DecompressionBombWarning for w in caught)


def _public_member(api, make_user, department):
    member = make_user(Role.TEACHER, full_name_ar="د. سلمى")
    DepartmentMembership.objects.create(department=department, user=member, kind="teacher")
    client = api(member)
    photo = _upload(client, "me.png", _png()).data["public_id"]
    assert client.patch("/api/v1/me", {"photo": photo}, format="json").status_code == 200
    assert (
        client.patch(
            "/api/v1/me/public-profile",
            {"public_profile": True, "public_photo": True},
            format="json",
        ).status_code
        == 200
    )
    return member


def test_probe_public_photo_still_served_after_member_leaves_teaching_staff(
    api, make_user, it_dept
):
    """DEFECT: PublicStaffPhotoView (organization/public.py:532-556) checks only the user's
    flags, not that they are still a teacher / TA / department manager. A member who gave
    consent and later lost the role and the department membership (moved to another job, or a
    student account that once held a TA role) disappears from «الكوادر», but their photo stays
    downloadable by anyone at /api/public/staff-photos/<id>.webp — a URL already published in
    earlier builds."""
    member = _public_member(api, make_user, it_dept)
    url = f"/api/public/staff-photos/{member.public_id}.webp"
    assert api().get(url).status_code == 200

    DepartmentMembership.objects.filter(user=member).delete()
    RoleAssignment.objects.filter(user=member).update(role=Role.HR)
    cache.clear()
    listed = api().get(f"/api/public/departments/{it_dept.code}").data["faculty"]
    assert listed == []  # no longer on the site …
    assert api().get(url).status_code == 200  # … but the photo is still public


def test_probe_public_staff_photo_is_cacheable_publicly_for_a_day(api, make_user, it_dept):
    """MINOR: withdrawing consent stops the URL on the server at once (verified), but the
    response was sent as `public, max-age=86400`, so any shared cache and every browser that
    saw it may keep showing the photo for up to 24 h after the member withdrew consent."""
    member = _public_member(api, make_user, it_dept)
    response = api().get(f"/api/public/staff-photos/{member.public_id}.webp")
    assert response.status_code == 200
    assert response["Cache-Control"] == "public, max-age=86400"


def test_probe_department_manager_name_public_without_consent(api, make_user, it_dept):
    """DEFECT (consent): docs/03 v2.3 — «كل عضو (أستاذ، معيد، رئيس قسم) يختار بنفسه الظهور …
    ولا يظهر أحد دون موافقته». The `manager` field of /api/public/departments[/<code>]
    (organization/public.py:295-299, no public_profile filter) carries the department manager's
    full Arabic name although they never turned public_profile on; the site prints it on the
    department pages, /departments, /about and /about/leadership."""
    make_user(Role.DEPARTMENT_MANAGER, department=it_dept, full_name_ar="د. مدير بلا موافقة")
    cache.clear()
    one = api().get(f"/api/public/departments/{it_dept.code}").data
    assert one["faculty"] == []  # not on «الكوادر» (no consent) …
    assert one["manager"] == "د. مدير بلا موافقة"  # … yet named publicly
    listed = api().get("/api/public/departments").data
    assert any(d["manager"] == "د. مدير بلا موافقة" for d in listed)
