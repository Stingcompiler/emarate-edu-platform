"""A student edits their own email, phone and photo (docs/03 §3.10; review 2026-10-25
decisions, item 13). The new email is confirmed by a code sent to it; the old address is told."""

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.rbac import Role
from audit.models import AuditLog
from conftest import last_code


def _png(width=900, height=600) -> bytes:
    """A real image (photos are decoded, cropped and re-encoded on upload)."""
    import io

    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (width, height), (40, 90, 160)).save(out, "PNG")
    return out.getvalue()


PNG = _png()


def test_a_student_changes_their_email_with_a_code(
    api, classroom, make_user, django_capture_on_commit_callbacks
):
    student = api(classroom.student)
    old = classroom.student.email
    with django_capture_on_commit_callbacks(execute=True):
        assert student.post("/api/v1/me/email", {"email": "New@Example.test"}).status_code == 202
    assert mail.outbox[-1].to == ["new@example.test"]
    code = last_code()
    wrong = student.post(
        "/api/v1/me/email/confirm", {"email": "new@example.test", "code": "000000"}
    )
    assert wrong.status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        done = student.post("/api/v1/me/email/confirm", {"email": "new@example.test", "code": code})
    assert done.status_code == 200, done.data
    assert done.data["email"] == "new@example.test"
    assert mail.outbox[-1].to == [old] and "new@example.test" in mail.outbox[-1].body
    assert AuditLog.objects.filter(action="account.email_change").count() == 1


def test_a_taken_address_gets_no_code_and_a_code_is_for_one_account(
    api, classroom, make_user, django_capture_on_commit_callbacks
):
    student = api(classroom.student)
    taken = make_user(Role.TEACHER).email
    sent = len(mail.outbox)
    with django_capture_on_commit_callbacks(execute=True):
        assert student.post("/api/v1/me/email", {"email": taken}).status_code == 202  # same
    assert len(mail.outbox) == sent  # but nothing goes to someone else's inbox
    # A code issued for one account does not change another one's email.
    with django_capture_on_commit_callbacks(execute=True):
        student.post("/api/v1/me/email", {"email": "mine@example.test"})
    code = last_code()
    other = make_user(Role.STUDENT)
    other_body = {"email": "mine@example.test", "code": code}
    assert api(other).post("/api/v1/me/email/confirm", other_body).status_code in (400, 403)


def test_phone_and_photo(api, classroom, make_user, it_dept, ba_dept):
    student = api(classroom.student)
    assert (
        student.patch("/api/v1/me", {"phone_e164": "0912345678"}, format="json").data["phone_e164"]
        == "+249912345678"
    )
    assert student.patch("/api/v1/me", {"phone_e164": "abc"}, format="json").status_code == 400
    uploaded = student.post(
        "/api/v1/files",
        {"purpose": "photo", "file": SimpleUploadedFile("me.png", PNG, "image/png")},
        format="multipart",
    )
    assert uploaded.status_code == 201, uploaded.data
    photo = uploaded.data["public_id"]
    me = student.patch("/api/v1/me", {"photo": photo}, format="json")
    assert me.status_code == 200 and str(me.data["photo"]) == str(photo)
    url = f"/api/v1/files/{photo}/url"
    assert student.get(url).status_code == 200
    # Staff who may see the record read it; another department does not.
    own = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    assert api(own).get(url).status_code == 200
    other_dept = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(other_dept).get(url).status_code in (403, 404)
    # A non-student may set a photo now (2026-10-30), not a phone here.
    other = make_user(Role.STUDENT)
    # Someone else's upload is refused (it is not theirs to use).
    assert api(other).patch("/api/v1/me", {"photo": photo}, format="json").status_code == 400
    teacher = api(classroom.teacher)
    assert (
        teacher.patch("/api/v1/me", {"phone_e164": "0912345678"}, format="json").status_code == 403
    )


@pytest.mark.parametrize("path", ["/api/v1/me/email", "/api/v1/me/email/confirm"])
def test_email_change_is_for_students(api, classroom, path):
    body = {"email": "x@example.test", "code": "123456"}
    assert api(classroom.teacher).post(path, body).status_code == 403


def test_everyone_has_a_photo_cropped_small_and_seen_by_colleagues(api, classroom, make_user):
    """Owner, 2026-10-30: every user may set a photo (3 MB at most); it is stored as a 512 px
    WebP square; a staff member's photo is seen by anyone signed in, through /photos/<id>."""
    from files.models import StoredFile

    teacher = api(classroom.teacher)
    uploaded = teacher.post(
        "/api/v1/files",
        {"purpose": "photo", "file": SimpleUploadedFile("me.png", _png(1200, 800), "image/png")},
        format="multipart",
    )
    assert uploaded.status_code == 201, uploaded.data
    stored = StoredFile.objects.get(public_id=uploaded.data["public_id"])
    assert stored.mime == "image/webp" and stored.size < 50_000
    from PIL import Image

    with stored.file.open("rb") as f, Image.open(f) as image:
        assert image.size == (512, 512)
    assert (
        teacher.patch("/api/v1/me", {"photo": str(stored.public_id)}, format="json").status_code
        == 200
    )
    photo_url = f"/api/v1/photos/{stored.public_id}"
    assert api(classroom.student).get(photo_url).status_code == 302
    assert api(make_user(Role.HR)).get(photo_url).status_code == 302
    assert api().get(photo_url).status_code in (401, 403)

    # A student's photo stays with the staff who may see their record.
    student = api(classroom.student)
    mine = student.post(
        "/api/v1/files",
        {"purpose": "photo", "file": SimpleUploadedFile("s.png", _png(), "image/png")},
        format="multipart",
    ).data["public_id"]
    student.patch("/api/v1/me", {"photo": mine}, format="json")
    assert api(make_user(Role.STUDENT)).get(f"/api/v1/photos/{mine}").status_code == 404

    # Over 3 MB, or not an image, is refused.
    big = SimpleUploadedFile("big.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * (3 * 1024 * 1024 + 1))
    assert (
        teacher.post(
            "/api/v1/files", {"purpose": "photo", "file": big}, format="multipart"
        ).status_code
        == 400
    )
    broken = SimpleUploadedFile("x.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "image/png")
    assert (
        teacher.post(
            "/api/v1/files", {"purpose": "photo", "file": broken}, format="multipart"
        ).status_code
        == 400
    )
