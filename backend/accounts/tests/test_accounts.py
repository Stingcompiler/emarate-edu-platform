def test_set_active(api, users, make_user):
    from accounts.rbac import Role

    teacher = make_user(Role.TEACHER, password="Pass-1234-word")
    url = f"/api/v1/users/{teacher.public_id}/set-active"
    assert (
        api(users[Role.ACADEMIC_AFFAIRS]).post(url, {"is_active": False}, format="json").status_code
        == 200
    )
    teacher.refresh_from_db()
    assert teacher.is_active is False
    registrar = users[Role.REGISTRAR]
    other = f"/api/v1/users/{registrar.public_id}/set-active"
    assert (
        api(users[Role.ACADEMIC_AFFAIRS])
        .post(other, {"is_active": False}, format="json")
        .status_code
        == 403
    )
    admin = users[Role.SYSTEM_ADMIN]
    assert api(admin).post(other, {"is_active": False}, format="json").status_code == 200
    mine = f"/api/v1/users/{admin.public_id}/set-active"
    assert api(admin).post(mine, {"is_active": False}, format="json").status_code == 403
    assert api(users[Role.HR]).post(url, {"is_active": True}, format="json").status_code == 403


def test_create_system_admin_command(db, api):
    from io import StringIO

    import pytest
    from django.core.management import CommandError, call_command

    from accounts import rbac
    from accounts.models import User

    out = StringIO()
    call_command("create_system_admin", email="Root@ECST.test", name="مدير", stdout=out)
    user = User.objects.get(email="root@ecst.test")
    assert rbac.has_role(user, rbac.Role.SYSTEM_ADMIN) and not user.has_usable_password()
    token = out.getvalue().rsplit("/activate/", 1)[1].strip()
    assert (
        api()
        .post("/api/public/activate", {"token": token, "password": "Strong-pass-9"}, format="json")
        .status_code
        == 200
    )
    with pytest.raises(CommandError):
        call_command("create_system_admin", email="root@ecst.test", name="x", stdout=StringIO())


def test_role_counts_follow_what_the_caller_may_grant(api, users):
    from accounts.rbac import Role

    everything = api(users[Role.SYSTEM_ADMIN]).get("/api/v1/role-assignments/counts").data
    assert everything["counts"][Role.TEACHER] == 1  # one user per role in the fixture
    assert set(everything["counts"]) == {r.value for r in Role}
    head = api(users[Role.HEAD_REGISTRAR]).get("/api/v1/role-assignments/counts").data
    assert head["counts"] == {Role.REGISTRAR: 1}


def test_the_admin_deletes_an_unused_account(api, users, make_user):
    """Owner request 2026-10-13: the system admin deletes an account nothing points at (made by
    mistake); one with a history is refused, because its records keep their author."""
    from accounts.models import User
    from accounts.rbac import Role
    from audit.models import AuditLog
    from audit.services import RequestMeta, record

    admin = users[Role.SYSTEM_ADMIN]
    client = api(admin)

    unused = make_user(Role.TEACHER)
    url = f"/api/v1/users/{unused.public_id}"
    # Only a system admin deletes (academic affairs may create and disable teachers, not delete).
    assert api(users[Role.ACADEMIC_AFFAIRS]).delete(url).status_code == 403
    assert client.delete(url).status_code == 204
    assert not User.objects.filter(pk=unused.pk).exists()
    entry = AuditLog.objects.get(action="account.delete")
    assert entry.actor_id == admin.pk and entry.old["email"] == unused.email

    # An account with a history (here: it acted in the audit log) is not deleted; disable it.
    worked = make_user(Role.HR)
    record(RequestMeta(actor=worked), "something.done", worked)
    refused = client.delete(f"/api/v1/users/{worked.public_id}")
    assert refused.status_code == 409 and refused.data["code"] == "has_history"
    assert User.objects.filter(pk=worked.pk).exists()
    assert not AuditLog.objects.filter(action="account.delete", target_id=str(worked.pk)).exists()

    # Never one's own account. A second admin can delete a fresh admin, but not the first one,
    # who has a history by now (the deletion above is in the log under their name).
    assert client.delete(f"/api/v1/users/{admin.public_id}").status_code == 403
    second = make_user(Role.SYSTEM_ADMIN)
    spare = make_user(Role.SYSTEM_ADMIN)
    assert api(second).delete(f"/api/v1/users/{spare.public_id}").status_code == 204
    assert api(second).delete(f"/api/v1/users/{admin.public_id}").status_code == 409


def test_the_admin_renames_a_staff_account(api, users, make_user, make_student, it_program):
    """Owner request 2026-10-13: the system admin corrects a staff member's name; a student's
    name stays with the student record."""
    from accounts.rbac import Role
    from audit.models import AuditLog

    admin = users[Role.SYSTEM_ADMIN]
    teacher = make_user(Role.TEACHER)
    url = f"/api/v1/users/{teacher.public_id}"
    body = {"full_name_ar": "  د.  سلمى   عثمان ", "full_name_en": "Dr Salma Osman"}

    assert api(users[Role.ACADEMIC_AFFAIRS]).patch(url, body, format="json").status_code == 403
    assert api(teacher).patch(url, body, format="json").status_code in (403, 404)
    done = api(admin).patch(url, body, format="json")
    assert done.status_code == 200, done.data
    teacher.refresh_from_db()
    assert teacher.full_name_ar == "د. سلمى عثمان" and teacher.full_name_en == "Dr Salma Osman"
    entry = AuditLog.objects.get(action="account.rename")
    assert entry.actor_id == admin.pk and entry.new["full_name_ar"] == "د. سلمى عثمان"

    # The same name again writes no second log entry; an empty Arabic name is refused.
    api(admin).patch(url, body, format="json")
    assert AuditLog.objects.filter(action="account.rename").count() == 1
    assert api(admin).patch(url, {"full_name_ar": "   "}, format="json").status_code == 400

    # A student account is renamed from the student record, not here.
    student_user = make_user(Role.STUDENT)
    make_student(it_program, "RN-0001", user=student_user)
    refused = api(admin).patch(
        f"/api/v1/users/{student_user.public_id}", {"full_name_ar": "اسم"}, format="json"
    )
    assert refused.status_code == 409 and refused.data["code"] == "student_account"


def test_the_users_and_applications_lists_sort_by_the_columns_the_tables_offer(
    api, users, make_user
):
    """Design review B7: the desktop tables sort through `?ordering=` (three states: asc, desc,
    none = the server's own order)."""
    from accounts.rbac import Role

    make_user(Role.TEACHER, full_name_ar="أحمد")
    make_user(Role.TEACHER, full_name_ar="يوسف")
    admin = users[Role.SYSTEM_ADMIN]

    def names(ordering):
        query = f"?page_size=100&ordering={ordering}" if ordering else "?page_size=100"
        rows = api(admin).get(f"/api/v1/users{query}").data["results"]
        return [row["full_name_ar"] for row in rows if row["full_name_ar"] in {"أحمد", "يوسف"}]

    assert names("full_name_ar") == ["أحمد", "يوسف"]
    assert names("-full_name_ar") == ["يوسف", "أحمد"]
    assert api(admin).get("/api/v1/users?ordering=-last_login").status_code == 200
    head = users[Role.HEAD_REGISTRAR]
    for ordering in ("reference_no", "-full_name", "submitted_at", "status"):
        response = api(head).get(f"/api/v1/applications?ordering={ordering}")
        assert response.status_code == 200, ordering


def test_the_admin_edits_a_users_profile(
    api, users, make_user, make_student, it_program, django_capture_on_commit_callbacks
):
    """Owner, 2026-10-30: the system admin edits name, email, phone, titles, interests and photo
    in one change; consent to appear on the site stays the person's; a student's name stays
    with the record; the old address is told of a new email."""
    import io

    from django.core import mail
    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    from accounts.rbac import Role
    from audit.models import AuditLog

    admin = api(users[Role.SYSTEM_ADMIN])
    staff = make_user(Role.TEACHER, email="old@ecst.edu.sd")
    url = f"/api/v1/users/{staff.public_id}"
    out = io.BytesIO()
    Image.new("RGB", (600, 600), (10, 20, 30)).save(out, "PNG")
    photo = admin.post(
        "/api/v1/files",
        {"purpose": "photo", "file": SimpleUploadedFile("p.png", out.getvalue(), "image/png")},
        format="multipart",
    ).data["public_id"]
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        changed = admin.patch(
            url,
            {
                "full_name_ar": "د. سلمى  الخضر",
                "email": "New@ECST.edu.sd",
                "phone_e164": "0912345678",
                "academic_title_ar": "أستاذ مساعد",
                "research_interests": "تعلم الآلة",
                "photo": photo,
                "public_profile": True,  # not the admin's to switch: ignored
            },
            format="json",
        )
    assert changed.status_code == 200, changed.data
    staff.refresh_from_db()
    assert staff.full_name_ar == "د. سلمى الخضر" and staff.email == "new@ecst.edu.sd"
    assert staff.phone_e164 == "+249912345678" and staff.academic_title_ar == "أستاذ مساعد"
    assert str(staff.photo.public_id) == str(photo) and staff.public_profile is False
    assert [m.to for m in mail.outbox] == [["old@ecst.edu.sd"]]
    log = AuditLog.objects.get(action="account.profile_update", target_id=str(staff.pk))
    assert set(log.new) >= {"full_name_ar", "email", "phone_e164", "photo"}

    # A taken email; another user's role cannot; a student's name stays with the record.
    other = make_user(Role.HR, email="taken@ecst.edu.sd")
    assert admin.patch(url, {"email": "taken@ecst.edu.sd"}, format="json").status_code == 400
    assert api(other).patch(url, {"academic_title_ar": "x"}, format="json").status_code == 403
    student_user = make_user(Role.STUDENT)
    make_student(it_program, "PR-0001", user=student_user)
    s_url = f"/api/v1/users/{student_user.public_id}"
    assert admin.patch(s_url, {"full_name_ar": "اسم"}, format="json").status_code == 409
    assert admin.patch(s_url, {"phone_e164": "0911111111"}, format="json").status_code == 200
    # Removing the photo.
    assert admin.patch(url, {"photo": None}, format="json").data["photo"] is None
