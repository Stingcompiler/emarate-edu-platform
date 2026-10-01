from accounts.rbac import Role


def test_system_status_for_the_admin_home(
    api, make_user, it_program, make_student, settings, tmp_path
):
    """Review 2026-09-29 PR 7: backups, email and records-vs-accounts, for the system admin."""
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(tmp_path)},
        },
    }
    (tmp_path / "backups").mkdir()
    (tmp_path / "backups" / "ecst-20260930T020000Z.dump.enc").write_bytes(b"x")
    make_student(it_program, "26-IT-0900")
    data = api(make_user(Role.SYSTEM_ADMIN)).get("/api/v1/system-status").data
    assert data["backups"] == {"count": 1, "latest": "2026-09-30T02:00:00+00:00"}
    assert data["email"]["sends_real_mail"] is False  # tests use the in-memory mailer
    assert data["students"]["records"] >= 1
    assert data["students"]["accounts"] <= data["students"]["records"]
