"""Photo upload and public photo hardening (review 2026-11 §1.3; the probes are in
docs/qa/evidence/review-2026-11/photos)."""

import io
from unittest import mock

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import EpsImagePlugin, Image

from academic.models import DepartmentMembership
from accounts.models import RoleAssignment
from accounts.rbac import Role
from files import validation


def _png(width=600, height=600, mode="RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, (width, height), 0 if mode in ("1", "L") else (40, 90, 160)).save(out, "PNG")
    return out.getvalue()


def _upload(client, name, content, content_type="image/png"):
    return client.post(
        "/api/v1/files",
        {"purpose": "photo", "file": SimpleUploadedFile(name, content, content_type)},
        format="multipart",
    )


EPS_AS_WEBP = (
    b"%!PS    WEBP\n%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 16 16\n%%EndComments\n"
    b"(attacker PostScript) pop\nshowpage\n"
)


def test_a_postscript_file_named_webp_never_reaches_ghostscript(api, make_user):
    upload = SimpleUploadedFile("me.webp", EPS_AS_WEBP, "image/webp")
    try:
        validation.check(upload, allowed={"webp"}, max_mb=3)
        raise AssertionError("an EPS named .webp passed the signature check")
    except validation.UploadError:
        pass
    calls = []
    with mock.patch.object(EpsImagePlugin, "Ghostscript", lambda *a, **k: calls.append(a)):
        response = _upload(api(make_user(Role.STUDENT)), "me.webp", EPS_AS_WEBP, "image/webp")
        # Past the signature (RIFF at 0, WEBP at 8), an EPS body is still not decoded as EPS.
        riff = b"RIFF\x00\x00\x00\x00WEBP" + EPS_AS_WEBP
        second = _upload(api(make_user(Role.STUDENT)), "me2.webp", riff, "image/webp")
    assert response.status_code == 400 and second.status_code == 400
    assert calls == []


def test_a_real_webp_photo_is_accepted(api, make_user):
    out = io.BytesIO()
    Image.new("RGB", (300, 300), (10, 20, 30)).save(out, "WEBP")
    assert (
        _upload(api(make_user(Role.STUDENT)), "me.webp", out.getvalue(), "image/webp").status_code
        == 201
    )


# Pillow warns while reading the header; the upload is refused right after, never decoded.
@pytest.mark.filterwarnings("ignore::PIL.Image.DecompressionBombWarning")
def test_a_decompression_bomb_is_refused_before_decoding(api, make_user):
    bomb = _png(9_500, 9_500, mode="1")
    response = _upload(api(make_user(Role.STUDENT)), "big.png", bomb)
    assert response.status_code == 400
    assert "file" in str(response.data)


def _public_member(api, make_user, department):
    member = make_user(Role.TEACHER, full_name_ar="د. سلمى")
    DepartmentMembership.objects.create(department=department, user=member, kind="teacher")
    client = api(member)
    photo = _upload(client, "me.png", _png()).data["public_id"]
    assert client.patch("/api/v1/me", {"photo": photo}, format="json").status_code == 200
    profile = {"public_profile": True, "public_photo": True}
    assert client.patch("/api/v1/me/public-profile", profile, format="json").status_code == 200
    return member


def test_the_public_photo_follows_the_staff_list(api, make_user, it_dept):
    member = _public_member(api, make_user, it_dept)
    url = f"/api/public/staff-photos/{member.public_id}.webp"
    response = api().get(url)
    assert response.status_code == 200
    assert response["Cache-Control"] == "public, max-age=300"
    DepartmentMembership.objects.filter(user=member).delete()
    RoleAssignment.objects.filter(user=member).update(role=Role.HR)
    cache.clear()
    assert api().get(url).status_code == 404


def test_a_department_head_keeps_a_public_photo(api, make_user, it_dept):
    head = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    client = api(head)
    photo = _upload(client, "me.png", _png()).data["public_id"]
    client.patch("/api/v1/me", {"photo": photo}, format="json")
    client.patch(
        "/api/v1/me/public-profile", {"public_profile": True, "public_photo": True}, format="json"
    )
    assert api().get(f"/api/public/staff-photos/{head.public_id}.webp").status_code == 200
