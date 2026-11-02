"""Editing departments and programs from «الهيكل الأكاديمي» (admin review 2026-11-02)."""

from accounts.rbac import Role
from audit.models import AuditLog
from organization.models import Department


def test_admin_edits_a_department_and_the_site_is_rebuilt(
    api, make_user, it_dept, monkeypatch, django_capture_on_commit_callbacks
):
    calls = []
    monkeypatch.setattr("organization.views.request_site_rebuild", lambda: calls.append(1))
    client = api(make_user(Role.SYSTEM_ADMIN))
    with django_capture_on_commit_callbacks(execute=True):
        response = client.patch(
            f"/api/v1/departments/{it_dept.pk}",
            {"name_ar": "تقنية المعلومات والحوسبة", "description": "نبذة", "is_active": False},
            format="json",
        )
    assert response.status_code == 200, response.data
    it_dept.refresh_from_db()
    assert (it_dept.name_ar, it_dept.description, it_dept.is_active) == (
        "تقنية المعلومات والحوسبة",
        "نبذة",
        False,
    )
    assert AuditLog.objects.filter(action="department.update").exists()
    assert calls == [1]


def test_admin_edits_a_program(api, make_user, it_program, django_capture_on_commit_callbacks):
    client = api(make_user(Role.SYSTEM_ADMIN))
    response = client.patch(
        f"/api/v1/programs/{it_program.pk}",
        {"name_ar": "علوم الحاسوب", "degree": "diploma", "levels_count": 3, "duration_terms": 6},
        format="json",
    )
    assert response.status_code == 200, response.data
    it_program.refresh_from_db()
    assert (it_program.degree, it_program.levels_count, it_program.duration_terms) == (
        "diploma",
        3,
        6,
    )
    bad = client.patch(f"/api/v1/programs/{it_program.pk}", {"levels_count": 11}, format="json")
    assert bad.status_code == 400


def test_a_department_in_use_is_not_deleted(api, make_user, it_program, college):
    client = api(make_user(Role.SYSTEM_ADMIN))
    response = client.delete(f"/api/v1/departments/{it_program.department_id}")
    assert response.status_code == 409
    assert response.data["code"] == "in_use"
    unused = Department.objects.create(college=college, code="X", name_ar="تجريبي")
    assert client.delete(f"/api/v1/departments/{unused.pk}").status_code == 204


def test_department_code_stays_unique(api, make_user, it_dept, ba_dept):
    client = api(make_user(Role.SYSTEM_ADMIN))
    response = client.patch(f"/api/v1/departments/{ba_dept.pk}", {"code": it_dept.code})
    assert response.status_code == 400


def test_others_cannot_edit_the_structure(api, make_user, it_dept):
    client = api(make_user(Role.ACADEMIC_AFFAIRS))
    response = client.patch(f"/api/v1/departments/{it_dept.pk}", {"name_ar": "x"})
    assert response.status_code == 403


def test_a_program_moves_department_only_while_unused(
    api, make_user, it_program, ba_dept, make_student
):
    client = api(make_user(Role.SYSTEM_ADMIN))
    url = f"/api/v1/programs/{it_program.pk}"
    assert client.patch(url, {"department": ba_dept.pk}, format="json").status_code == 200
    it_program.refresh_from_db()
    assert it_program.department_id == ba_dept.pk
    make_student(it_program, "26-BA-0901")
    response = client.patch(url, {"department": it_program.department_id}, format="json")
    assert response.status_code == 200  # same department: not a move
    other = Department.objects.exclude(pk=ba_dept.pk).first()
    response = client.patch(url, {"department": other.pk}, format="json")
    assert response.status_code == 400
    assert "department" in str(response.data)
