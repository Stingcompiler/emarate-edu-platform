"""Editing departments and programs from «الهيكل الأكاديمي» (admin review 2026-11-02)."""

# ruff: noqa: F811  (the intake fixture is imported by name)

from accounts.rbac import Role
from admissions.models import ProgramIntake
from admissions.tests.test_admissions import intake  # noqa: F401
from audit.models import AuditLog
from content.models import Redirect
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


# ── review 2026-11 (R26–R28), the probes in docs/qa/evidence/review-2026-11 ──────────────


def test_r26_a_stopped_programme_or_department_takes_no_applications(intake):
    program = intake.program
    assert intake.accepting()
    program.is_active = False
    program.save(update_fields=["is_active"])
    assert not ProgramIntake.objects.get(pk=intake.pk).accepting()
    program.is_active = True
    program.save(update_fields=["is_active"])
    program.department.is_active = False
    program.department.save(update_fields=["is_active"])
    assert not ProgramIntake.objects.get(pk=intake.pk).accepting()


def test_r26_the_apply_list_leaves_out_a_stopped_programme(api, intake):
    assert [r["id"] for r in api().get("/api/public/intakes").data] == [intake.pk]
    intake.program.is_active = False
    intake.program.save(update_fields=["is_active"])
    assert api().get("/api/public/intakes").data == []


def test_r27_a_new_code_redirects_the_old_site_links(api, make_user, it_dept, it_program):
    client = api(make_user(Role.SYSTEM_ADMIN))
    assert client.patch(f"/api/v1/departments/{it_dept.pk}", {"code": "ITX"}).status_code == 200
    old = it_program.code
    assert client.patch(f"/api/v1/programs/{it_program.pk}", {"code": "BITX"}).status_code == 200
    redirects = dict(Redirect.objects.values_list("from_path", "to_path"))
    assert redirects["/ar/departments/IT/"] == "/ar/departments/ITX/"
    assert redirects["/en/departments/IT"] == "/en/departments/ITX/"
    assert redirects[f"/ar/programs/{old}/"] == "/ar/programs/BITX/"
    # Back to the first code: that address is the page again; the newer one points back.
    assert client.patch(f"/api/v1/departments/{it_dept.pk}", {"code": "IT"}).status_code == 200
    redirects = dict(Redirect.objects.values_list("from_path", "to_path"))
    assert "/ar/departments/IT/" not in redirects
    assert redirects["/ar/departments/ITX/"] == "/ar/departments/IT/"


def test_r28_a_programme_with_an_unused_intake_can_be_deleted(api, make_user, intake):
    client = api(make_user(Role.SYSTEM_ADMIN))
    assert client.delete(f"/api/v1/programs/{intake.program_id}").status_code == 204
    assert not ProgramIntake.objects.filter(pk=intake.pk).exists()


def test_twenty_quick_edits_make_one_site_build(
    api, make_user, it_program, settings, monkeypatch, django_capture_on_commit_callbacks
):
    from content import tasks

    settings.SITE_REBUILD_HOOK_URL = "https://hooks.example.test/build"
    builds = []
    monkeypatch.setattr(tasks.trigger_site_rebuild, "apply_async", lambda **kw: builds.append(kw))
    client = api(make_user(Role.SYSTEM_ADMIN))
    for n in range(20):
        with django_capture_on_commit_callbacks(execute=True):
            client.patch(f"/api/v1/programs/{it_program.pk}", {"total_credit_hours": 100 + n})
    assert builds == [{"countdown": 30}]


def test_r29_years_and_terms_with_reversed_dates_get_a_message(api, make_user, term):
    client = api(make_user(Role.SYSTEM_ADMIN))
    year = client.post(
        "/api/v1/academic-years",
        {"name": "2027/2028", "starts_on": "2028-06-30", "ends_on": "2027-09-01"},
        format="json",
    )
    assert year.status_code == 400 and "ends_on" in str(year.data)
    bad = client.patch(f"/api/v1/terms/{term.pk}", {"ends_on": "2000-01-01"}, format="json")
    assert bad.status_code == 400 and "ends_on" in str(bad.data)
    good = client.post(
        "/api/v1/academic-years",
        {
            "name": "2027/2028",
            "starts_on": "2027-09-01",
            "ends_on": "2028-06-30",
            "is_current": True,
        },
        format="json",
    )
    assert good.status_code == 201 and good.data["is_current"] is False  # set-current only
    renamed = client.patch(
        f"/api/v1/terms/{term.pk}", {"name_ar": "خريف 2026 (معدّل)"}, format="json"
    )
    assert renamed.status_code == 200


# ── merging and deleting a department (owner 2026-11-05) ─────────────────────────────────


def test_a_department_is_merged_into_another(api, make_user, college, it_dept):
    from academic.models import DepartmentMembership
    from organization.models import Program

    wrong = Department.objects.create(college=college, code="NUR", name_ar="بكالوريوس التمريض")
    program = Program.objects.create(
        department=wrong,
        code="BNUR",
        name_ar="بكالوريوس التمريض",
        degree="bachelor",
        levels_count=4,
        duration_terms=8,
    )
    teacher = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(department=wrong, user=teacher, kind="teacher")
    make_user(Role.DEPARTMENT_MANAGER, department=wrong)
    admin = api(make_user(Role.SYSTEM_ADMIN))
    found = admin.get(f"/api/v1/departments/{wrong.pk}/usage").data
    assert found["can_merge"] and found["can_delete"] and len(found["roles"]) == 1
    assert (
        api(make_user(Role.ACADEMIC_AFFAIRS))
        .post(f"/api/v1/departments/{wrong.pk}/merge", {"into": it_dept.pk})
        .status_code
        == 403
    )
    merged = admin.post(f"/api/v1/departments/{wrong.pk}/merge", {"into": it_dept.pk})
    assert merged.status_code == 200 and merged.data["result"] == "deleted"
    program.refresh_from_db()
    assert program.department_id == it_dept.pk
    assert not Department.objects.filter(pk=wrong.pk).exists()
    assert DepartmentMembership.objects.filter(department=it_dept, user=teacher).exists()
    assert Redirect.objects.get(from_path="/ar/departments/NUR/").to_path == "/ar/departments/IT/"
    assert AuditLog.objects.filter(action="department.merge").exists()


def test_a_department_in_use_is_neither_merged_nor_deleted(
    api, make_user, it_dept, ba_dept, it_program, make_student
):
    make_student(it_program, "26-IT-0990")
    admin = api(make_user(Role.SYSTEM_ADMIN))
    found = admin.get(f"/api/v1/departments/{it_dept.pk}/usage").data
    assert not found["can_merge"] and found["programs"][0]["students"] == 1
    merged = admin.post(f"/api/v1/departments/{it_dept.pk}/merge", {"into": ba_dept.pk})
    assert merged.status_code == 409 and merged.data["code"] == "in_use"
    assert admin.delete(f"/api/v1/departments/{it_dept.pk}?with_programs=1").status_code == 409


def test_a_department_goes_with_its_free_programmes(api, make_user, college):
    from organization.models import Program

    wrong = Department.objects.create(college=college, code="X1", name_ar="تجريبي")
    Program.objects.create(
        department=wrong,
        code="PX1",
        name_ar="برنامج تجريبي",
        degree="diploma",
        levels_count=2,
        duration_terms=4,
    )
    admin = api(make_user(Role.SYSTEM_ADMIN))
    assert admin.delete(f"/api/v1/departments/{wrong.pk}").status_code == 409  # plain: in use
    assert admin.delete(f"/api/v1/departments/{wrong.pk}?with_programs=1").status_code == 204
    assert not Program.objects.filter(code="PX1").exists()


def test_a_department_with_history_is_stopped_not_deleted(api, make_user, college, it_dept):
    from audit.services import RequestMeta, record
    from organization.models import Program

    wrong = Department.objects.create(college=college, code="H1", name_ar="بتاريخ")
    Program.objects.create(
        department=wrong,
        code="PH1",
        name_ar="برنامج",
        degree="diploma",
        levels_count=2,
        duration_terms=4,
    )
    admin_user = make_user(Role.SYSTEM_ADMIN)
    record(RequestMeta(actor=admin_user), "intake.create", wrong, department_id=wrong.pk)
    admin = api(admin_user)
    found = admin.get(f"/api/v1/departments/{wrong.pk}/usage").data
    assert found["history"] == 1 and not found["can_delete"] and found["can_merge"]
    deleted = admin.delete(f"/api/v1/departments/{wrong.pk}?with_programs=1")
    assert deleted.status_code == 409 and deleted.data["code"] == "has_history"
    merged = admin.post(f"/api/v1/departments/{wrong.pk}/merge", {"into": it_dept.pk})
    assert merged.data["result"] == "stopped"
    wrong.refresh_from_db()
    assert wrong.is_active is False and not wrong.programs.exists()


# --- Review 2026-11-10, axis 1.3 (probes R67–R70, R72 turned into tests) -------------------


def _wrong_department(college):
    """A programme entered as a department (the production case): one free programme."""
    from organization.models import Program

    department = Department.objects.create(college=college, code="NUR", name_ar="التمريض")
    Program.objects.create(
        department=department,
        code="BNUR",
        name_ar="بكالوريوس التمريض",
        degree="bachelor",
        levels_count=4,
        duration_terms=8,
    )
    return department


def test_a_member_of_both_departments_keeps_their_place_in_the_target(
    api, make_user, college, it_dept
):
    """R67: a teacher in the merged department who assists in the target broke the merge."""
    from academic.models import DepartmentMembership

    wrong = _wrong_department(college)
    member = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(department=wrong, user=member, kind="teacher")
    DepartmentMembership.objects.create(department=it_dept, user=member, kind="ta")
    admin = api(make_user(Role.SYSTEM_ADMIN))
    merged = admin.post(f"/api/v1/departments/{wrong.pk}/merge", {"into": it_dept.pk})
    assert merged.status_code == 200, merged.data
    assert list(
        DepartmentMembership.objects.filter(user=member).values_list("department", "kind")
    ) == [(it_dept.pk, "ta")]


def test_what_was_addressed_to_a_merged_department_follows_it(api, make_user, college, it_dept):
    """R68: its admission inquiries and its news go to the target; R70: its own roles end
    with it even when it is stopped rather than deleted, as the audit entry says."""
    from accounts.models import RoleAssignment
    from contacts.models import Contact
    from content.models import Announcement
    from inquiries.models import Inquiry

    wrong = _wrong_department(college)
    manager = make_user(Role.DEPARTMENT_MANAGER, department=wrong)
    inquiry = Inquiry.objects.create(
        reference_no="INQ-1",
        contact=Contact.objects.create(email="visitor@x.test", name="زائر"),
        type="admission",
        department=wrong,
        subject="القبول",
        message="متى يفتح التقديم؟",
    )
    news = Announcement.objects.create(
        scope="department",
        scope_id=wrong.pk,
        audience="public",
        title="خبر القسم",
        body="<p>نص</p>",
        status="published",
        created_by=manager,
    )
    AuditLog.objects.create(
        action="department.update",
        target_type="department",
        target_id=str(wrong.pk),
        target_repr="x",
        department=wrong,
    )
    admin = api(make_user(Role.SYSTEM_ADMIN))
    merged = admin.post(f"/api/v1/departments/{wrong.pk}/merge", {"into": it_dept.pk})
    assert merged.status_code == 200 and merged.data["result"] == "stopped"  # it has history
    inquiry.refresh_from_db()
    news.refresh_from_db()
    assert inquiry.department_id == it_dept.pk and news.scope_id == it_dept.pk
    assert not RoleAssignment.objects.filter(user=manager, department=wrong).exists()
    entry = AuditLog.objects.get(action="department.merge")
    assert entry.new["inquiries"] == 1 and entry.new["news"] == 1 and entry.old["roles_removed"]


def test_a_department_is_not_merged_into_a_stopped_one(api, make_user, college, it_dept):
    """R69: its programmes would leave the site and applying with the stopped department."""
    wrong = _wrong_department(college)
    it_dept.is_active = False
    it_dept.save(update_fields=["is_active"])
    admin = api(make_user(Role.SYSTEM_ADMIN))
    refused = admin.post(f"/api/v1/departments/{wrong.pk}/merge", {"into": it_dept.pk})
    assert refused.status_code == 400 and "into" in refused.data["errors"]
    assert Department.objects.filter(pk=wrong.pk, is_active=True).exists()


def test_levels_are_not_lowered_under_students_or_courses(
    api, make_user, make_student, it_program, it_course
):
    """R72: nobody is left above a programme's last level."""
    make_student(it_program, "26-IT-0001", level=4)
    admin = api(make_user(Role.SYSTEM_ADMIN))
    url = f"/api/v1/programs/{it_program.pk}"
    refused = admin.patch(url, {"levels_count": 3}, format="json")
    assert refused.status_code == 400 and "levels_count" in refused.data["errors"]
    it_program.refresh_from_db()
    assert it_program.levels_count == 4
    # Raising it, or lowering it to where everyone still fits, is fine.
    assert admin.patch(url, {"levels_count": 5}, format="json").status_code == 200
    assert admin.patch(url, {"levels_count": 4}, format="json").status_code == 200
