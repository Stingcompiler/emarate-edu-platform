"""QA probes, review 2026-11-10 axes 1.3 (merging departments) and 1.2 (promotion, levels).
Each test EXPECTS THE FAULTY BEHAVIOUR: a pass means the defect is reproduced. When a defect
is fixed its probe fails and is turned into a regular test asserting the right behaviour."""

import pytest
from django.db import IntegrityError

from academic.models import DepartmentMembership
from accounts.models import RoleAssignment
from accounts.rbac import Role
from audit.models import AuditLog
from contacts.models import Contact
from content.models import Announcement
from inquiries.models import Inquiry
from organization.models import Department, Program
from students.models import PromotionRun

PROMOTE = "/api/v1/student-promotion"


@pytest.fixture
def wrong(college):
    """A programme entered as a department (the production case): one free programme."""
    department = Department.objects.create(college=college, code="NUR", name_ar="بكالوريوس التمريض")
    Program.objects.create(
        department=department,
        code="BNUR",
        name_ar="بكالوريوس التمريض",
        degree="bachelor",
        levels_count=4,
        duration_terms=8,
    )
    return department


def _merge(api, make_user, source, into):
    return api(make_user(Role.SYSTEM_ADMIN)).post(
        f"/api/v1/departments/{source.pk}/merge", {"into": into.pk}
    )


# ─── R67: a member of both departments with a different kind breaks the merge ─────────────


def test_probe_r67_a_member_of_both_departments_breaks_the_merge(api, make_user, wrong, it_dept):
    """Membership is unique per (department, user); the merge looks the member up by
    (department, user, kind). A teacher in the merged department who is a teaching assistant
    in the target is not found, the insert hits the constraint, and the merge is a 500."""
    member = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(department=wrong, user=member, kind="teacher")
    DepartmentMembership.objects.create(department=it_dept, user=member, kind="ta")
    with pytest.raises(IntegrityError):
        _merge(api, make_user, wrong, it_dept)


# ─── R68: what points at the merged department is left behind ─────────────────────────────


def test_probe_r68_inquiries_and_news_stay_behind_the_merge(api, make_user, wrong, it_dept):
    """The merge moves programmes and members. An admission inquiry addressed to the merged
    department loses its department (SET_NULL): the target's registrars never see it. The
    department's public news keeps the id of a department that no longer exists."""
    contact = Contact.objects.create(email="visitor@x.test", name="زائر")
    inquiry = Inquiry.objects.create(
        reference_no="INQ-1",
        contact=contact,
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
        created_by=make_user(Role.DEPARTMENT_MANAGER, department=wrong),
    )
    merged = _merge(api, make_user, wrong, it_dept)
    assert merged.status_code == 200 and merged.data["result"] == "deleted"
    inquiry.refresh_from_db()
    news.refresh_from_db()
    assert inquiry.department_id is None  # not it_dept
    assert news.scope_id == wrong.pk and not Department.objects.filter(pk=wrong.pk).exists()


# ─── R69: programmes are merged into a stopped department ─────────────────────────────────


def test_probe_r69_merging_into_a_stopped_department_is_accepted(api, make_user, wrong, it_dept):
    """A stopped department is off the site and off applying: programmes merged into it vanish
    with it, and nothing says so."""
    it_dept.is_active = False
    it_dept.save(update_fields=["is_active"])
    merged = _merge(api, make_user, wrong, it_dept)
    assert merged.status_code == 200


# ─── R70: the audit says the roles were removed; a stopped department keeps them ──────────


def test_probe_r70_a_stopped_department_keeps_the_roles_the_audit_says_removed(
    api, make_user, wrong, it_dept
):
    """With history the merged department is stopped, not deleted, so its role assignments
    stay (they only went by the delete's cascade) — while the audit entry lists them as
    removed. Its manager still manages an empty, stopped department."""
    manager = make_user(Role.DEPARTMENT_MANAGER, department=wrong)
    AuditLog.objects.create(
        action="department.update",
        target_type="department",
        target_id=str(wrong.pk),
        target_repr="x",
        department=wrong,
    )
    merged = _merge(api, make_user, wrong, it_dept)
    assert merged.status_code == 200 and merged.data["result"] == "stopped"
    entry = AuditLog.objects.get(action="department.merge")
    assert entry.old["roles_removed"]  # the log says so …
    assert RoleAssignment.objects.filter(user=manager, department=wrong).exists()  # … but no


# ─── R71: a run with nobody to promote burns the college's promotion for the term ─────────


def test_probe_r71_an_empty_run_blocks_the_college_for_the_term(
    api, make_user, make_student, it_program, wrong, term
):
    """Promotion is «once per term»: any department's run refuses a later run for the whole
    college. A department with no student still records a run, so one wrong pick in the
    filter blocks the college-wide promotion until next term; the rest must then be promoted
    department by department. (An id that does not exist is not checked either: the audit row
    then breaks its foreign key — a 500 on PostgreSQL.)"""
    student = make_student(it_program, "26-IT-0001", level=1)
    head = api(make_user(Role.HEAD_REGISTRAR))
    empty = head.post(PROMOTE, {"department": wrong.pk}, format="json")
    assert empty.status_code == 200 and empty.data["promoted"] == 0
    assert PromotionRun.objects.count() == 1
    college = head.post(PROMOTE, {}, format="json")
    assert college.status_code == 409 and college.data["code"] == "already_promoted"
    student.refresh_from_db()
    assert (student.level, student.semester) == (1, 1)  # nobody moved, and nobody can


# ─── R72: a programme's levels are lowered under its students ─────────────────────────────


def test_probe_r72_levels_are_lowered_under_students_and_courses(
    api, make_user, make_student, it_program
):
    """Nothing checks who is above the new last level: a student in level 4 of a programme cut
    to 3 levels is outside the plan, and every form then refuses their own level."""
    student = make_student(it_program, "26-IT-0001", level=4)
    lowered = api(make_user(Role.SYSTEM_ADMIN)).patch(
        f"/api/v1/programs/{it_program.pk}", {"levels_count": 3}, format="json"
    )
    assert lowered.status_code == 200, lowered.data
    student.refresh_from_db()
    assert student.level == 4 and lowered.data["levels_count"] == 3
