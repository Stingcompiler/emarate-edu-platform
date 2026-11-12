"""«الكوادر» in groups (owner, 2026-11-09): the system admin and the site manager add people to
the site's page (never an account), and sort them into flexible groups on a matrix."""

import pytest

from academic.models import DepartmentMembership
from accounts.rbac import Role
from audit.models import AuditLog
from content.models import StaffGroup

BOARD = "/api/v1/site-staff"
GROUPS = "/api/v1/site-staff/groups"
ENTRIES = "/api/v1/site-staff/entries"
PUBLIC = "/api/public/staff"


@pytest.fixture
def teacher(make_user, it_dept):
    user = make_user(
        Role.TEACHER, full_name_ar="د. سلمى الخضر", public_profile=True, academic_title_ar="د."
    )
    DepartmentMembership.objects.create(department=it_dept, user=user, kind="teacher")
    return user


def _groups():
    return {g.name_ar: g for g in StaffGroup.objects.all()}


def _public(api):
    from django.core.cache import cache

    cache.clear()
    return {g["name_ar"]: g["members"] for g in api().get(PUBLIC).data}


def test_two_groups_to_start_with_and_teachers_placed_by_themselves(api, teacher, make_user):
    groups = _groups()
    assert list(groups) == ["هيئة الإدارة", "هيئة التدريس"]
    assert groups["هيئة التدريس"].holds_faculty
    # A teacher who chose to appear is in the faculty group without anyone placing them …
    assert [m["name_ar"] for m in _public(api)["هيئة التدريس"]] == ["د. سلمى الخضر"]
    row = api(make_user(Role.SITE_MANAGER)).get(BOARD).data["rows"][0]
    assert row["automatic"] and row["placements"][0]["group"] == groups["هيئة التدريس"].pk
    # … and one who did not choose to appear is nowhere.
    teacher.public_profile = False
    teacher.save(update_fields=["public_profile"])
    assert _public(api) == {}


def test_the_site_manager_adds_people_and_sorts_them_on_the_matrix(
    api, teacher, make_user, django_capture_on_commit_callbacks
):
    site = api(make_user(Role.SITE_MANAGER))
    groups = _groups()
    admin_group, faculty = groups["هيئة الإدارة"], groups["هيئة التدريس"]
    # A person with no account: the dean, at the top of the administration.
    with django_capture_on_commit_callbacks(execute=True):
        dean = site.post(
            ENTRIES,
            {
                "name_ar": "أ.د. عمر الأمين",
                "placements": [{"group": admin_group.pk, "position_ar": "عميد الكلية"}],
            },
            format="json",
        )
    assert dean.status_code == 201, dean.data
    assert not dean.data["account"] and dean.data["consent"]
    # A staff account who consented: the registrar, in the administration.
    registrar = make_user(Role.HEAD_REGISTRAR, full_name_ar="أ. سعاد إبراهيم", public_profile=True)
    added = site.post(
        ENTRIES,
        {"user": str(registrar.public_id), "placements": [{"group": admin_group.pk, "order": 2}]},
        format="json",
    )
    assert added.status_code == 201, added.data
    # The teacher is in both groups: placing them by hand keeps the faculty group as well.
    both = [
        {"group": admin_group.pk, "position_ar": "رئيسة قسم", "order": 1},
        {"group": faculty.pk},
    ]
    assert (
        site.post(
            ENTRIES, {"user": str(teacher.public_id), "placements": both}, format="json"
        ).status_code
        == 201
    )

    shown = _public(api)
    assert [(m["name_ar"], m["position_ar"]) for m in shown["هيئة الإدارة"]] == [
        ("أ.د. عمر الأمين", "عميد الكلية"),
        ("د. سلمى الخضر", "رئيسة قسم"),
        ("أ. سعاد إبراهيم", ""),
    ]
    assert [m["name_ar"] for m in shown["هيئة التدريس"]] == ["د. سلمى الخضر"]
    assert shown["هيئة الإدارة"][0]["id"] is None  # no account, no page
    assert AuditLog.objects.filter(action="site.staff_add").count() == 3

    # Unticking the faculty group takes the teacher out of it; removing the entry puts them back.
    entry = next(
        r["entry"] for r in site.get(BOARD).data["rows"] if r["name_ar"] == "د. سلمى الخضر"
    )
    site.patch(f"{ENTRIES}/{entry}", {"placements": both[:1]}, format="json")
    assert "هيئة التدريس" not in _public(api)
    assert site.delete(f"{ENTRIES}/{entry}").status_code == 204
    assert [m["name_ar"] for m in _public(api)["هيئة التدريس"]] == ["د. سلمى الخضر"]


def test_an_account_appears_only_with_its_consent_and_never_a_student(api, make_user):
    site = api(make_user(Role.SYSTEM_ADMIN))
    group = _groups()["هيئة الإدارة"]
    shy = make_user(Role.HR, full_name_ar="أ. رشا المكي")
    added = site.post(
        ENTRIES, {"user": str(shy.public_id), "placements": [{"group": group.pk}]}, format="json"
    )
    assert added.status_code == 201 and not added.data["consent"]
    assert _public(api) == {}  # on the matrix, not on the site
    student = make_user(Role.STUDENT, full_name_ar="طالب")
    refused = site.post(ENTRIES, {"user": str(student.public_id)}, format="json")
    assert refused.status_code == 400
    names = [p["full_name_ar"] for p in site.get(f"{BOARD}/people?search=رشا").data]
    assert names == ["أ. رشا المكي"]
    assert site.get(f"{BOARD}/people?search=طالب").data == []
    # No browsing and no look-up by email (review 2026-11-09).
    assert site.get(f"{BOARD}/people").data == []
    assert site.get(f"{BOARD}/people?search={shy.email}").data == []
    # The account itself chooses to appear (any staff, not only teachers); a student cannot.
    assert api(shy).patch("/api/v1/me/public-profile", {"public_profile": True}).status_code == 200
    assert [m["name_ar"] for m in _public(api)["هيئة الإدارة"]] == ["أ. رشا المكي"]
    assert (
        api(student).patch("/api/v1/me/public-profile", {"public_profile": True}).status_code == 403
    )
    # Once no longer staff (roles taken away, the account kept), it drops off by itself.
    shy.role_assignments.all().delete()
    assert _public(api) == {}
    row = site.get(BOARD).data["rows"][0]
    assert row["consent"] and not row["staff"]


def test_groups_are_flexible_but_the_faculty_always_has_one(api, teacher, make_user):
    site = api(make_user(Role.SITE_MANAGER))
    made = site.post(
        GROUPS, {"name_ar": "مجلس الأمناء", "name_en": "Board of Trustees"}, format="json"
    )
    assert made.status_code == 201, made.data
    trustees = made.data["id"]
    faculty = _groups()["هيئة التدريس"]
    # The faculty group cannot be dropped or unflagged; the flag moves to another group.
    assert site.delete(f"{GROUPS}/{faculty.pk}").status_code == 409
    unflag = site.patch(f"{GROUPS}/{faculty.pk}", {"holds_faculty": False}, format="json")
    assert unflag.status_code == 409
    moved = site.patch(f"{GROUPS}/{trustees}", {"holds_faculty": True}, format="json")
    assert moved.status_code == 200, moved.data.get("errors")
    assert not StaffGroup.objects.get(pk=faculty.pk).holds_faculty
    assert [m["name_ar"] for m in _public(api)["مجلس الأمناء"]] == ["د. سلمى الخضر"]
    # A hidden group leaves the site; renaming shows at once.
    site.patch(f"{GROUPS}/{trustees}", {"is_visible": False}, format="json")
    assert "مجلس الأمناء" not in _public(api)
    assert site.delete(f"{GROUPS}/{faculty.pk}").status_code == 204
    assert AuditLog.objects.filter(action="site.staff_group_delete").exists()


def test_who_may_manage_the_page(api, users):
    allowed = {Role.SYSTEM_ADMIN, Role.SYSTEM_SUPERVISOR, Role.SITE_MANAGER}
    for role, user in users.items():
        status = api(user).get(BOARD).status_code
        assert (status == 200) == (role in allowed), role
    # The supervisor deletes nothing (docs/roles-matrix.md).
    group = _groups()["هيئة الإدارة"]
    assert api(users[Role.SYSTEM_SUPERVISOR]).delete(f"{GROUPS}/{group.pk}").status_code == 403


def test_a_placed_administrator_shows_their_photo_with_consent(api, make_user):
    from accounts.tests.test_staff_profile import _photo

    registrar = make_user(Role.HEAD_REGISTRAR, full_name_ar="أ. سعاد", public_profile=True)
    _photo(api(registrar))
    registrar.public_photo = True
    registrar.save(update_fields=["public_photo"])
    url = f"/api/public/staff-photos/{registrar.public_id}.webp"
    assert api().get(url).status_code == 404  # not on the page yet
    group = _groups()["هيئة الإدارة"]
    api(make_user(Role.SITE_MANAGER)).post(
        ENTRIES,
        {"user": str(registrar.public_id), "placements": [{"group": group.pk}]},
        format="json",
    )
    assert api().get(url).status_code == 200
    assert _public(api)["هيئة الإدارة"][0]["photo"].endswith(url)


def test_a_teaching_assistant_who_also_studies_is_staff(api, make_user, it_dept):
    """Plan 2026-11-10, K1: a master's student who assists holds the student role too; the
    first version of the staff rule shut them out of their own consent and off the page."""
    assistant = make_user(Role.TA, Role.STUDENT, full_name_ar="م. ياسر عبد الباقي")
    DepartmentMembership.objects.create(department=it_dept, user=assistant, kind="ta")
    mine = api(assistant)
    assert mine.patch("/api/v1/me/public-profile", {"public_profile": True}).status_code == 200
    degree = {"degree": "bachelor", "field": "تقنية المعلومات", "institution": "ECST"}
    assert mine.post("/api/v1/me/qualifications", degree, format="json").status_code == 201
    # Placed by themselves in the faculty group, and the site team finds and places them.
    assert [m["name_ar"] for m in _public(api)["هيئة التدريس"]] == ["م. ياسر عبد الباقي"]
    site = api(make_user(Role.SITE_MANAGER))
    assert [p["full_name_ar"] for p in site.get(f"{BOARD}/people?search=ياسر").data] == [
        "م. ياسر عبد الباقي"
    ]
    group = _groups()["هيئة الإدارة"]
    placed = site.post(
        ENTRIES,
        {"user": str(assistant.public_id), "placements": [{"group": group.pk}]},
        format="json",
    )
    assert placed.status_code == 201 and placed.data["staff"]
    assert [m["name_ar"] for m in _public(api)["هيئة الإدارة"]] == ["م. ياسر عبد الباقي"]


def test_groups_reorder_in_one_write(api, make_user):
    """K7: one request and one audit entry for a move, whatever the stored orders were."""
    site = api(make_user(Role.SITE_MANAGER))
    StaffGroup.objects.filter(name_ar="هيئة الإدارة").update(order=5)
    StaffGroup.objects.filter(name_ar="هيئة التدريس").update(order=9)
    third = site.post(GROUPS, {"name_ar": "مجلس الأمناء"}, format="json").data["id"]
    groups = _groups()
    ids = [third, groups["هيئة الإدارة"].pk, groups["هيئة التدريس"].pk]
    moved = site.put(f"{GROUPS}/order", {"ids": ids}, format="json")
    assert moved.status_code == 200, moved.data
    assert [g["name_ar"] for g in site.get(GROUPS).data] == [
        "مجلس الأمناء",
        "هيئة الإدارة",
        "هيئة التدريس",
    ]
    assert list(StaffGroup.objects.values_list("order", flat=True)) == [1, 2, 3]
    assert AuditLog.objects.filter(action="site.staff_group_reorder").count() == 1
    # Every group once: a missing or repeated id is refused.
    assert site.put(f"{GROUPS}/order", {"ids": ids[:2]}, format="json").status_code == 400
    assert (
        site.put(f"{GROUPS}/order", {"ids": [*ids[:2], ids[0]]}, format="json").status_code == 400
    )
    # Not a delete: the system supervisor reorders too; other roles do not.
    assert (
        api(make_user(Role.SYSTEM_SUPERVISOR))
        .put(f"{GROUPS}/order", {"ids": ids}, format="json")
        .status_code
        == 200
    )
    assert (
        api(make_user(Role.HEAD_REGISTRAR))
        .put(f"{GROUPS}/order", {"ids": ids}, format="json")
        .status_code
        == 403
    )


def test_the_board_says_when_the_site_hides_a_sample_title(api, teacher, make_user):
    """The site drops a person whose title says «(مثال)» (lib/sample.mjs); the board says why
    instead of leaving them silently missing (review 2026-11-12)."""
    site = api(make_user(Role.SITE_MANAGER))
    assert [r["sample"] for r in site.get(BOARD).data["rows"]] == [False]
    teacher.academic_title_ar = "(مثال) أستاذ مشارك"
    teacher.save(update_fields=["academic_title_ar"])
    assert [r["sample"] for r in site.get(BOARD).data["rows"]] == [True]
    placed = site.post(ENTRIES, {"name_ar": "عميد", "title_en": "Dean (Example)"}, format="json")
    assert placed.status_code == 201, placed.data
    rows = {r["name_ar"]: r["sample"] for r in site.get(BOARD).data["rows"]}
    assert rows["عميد"] is True
