"""Writes added since the roles audit of 2026-11-06 (review 2026-11-10, axis 2): every role
that the approved matrix does not give the operation is refused (403/404), and every role it
gives it is not. The older write suites cover the surface the audit saw; these rows are the
endpoints merged after it (#252–#266), whose own tests show the happy path only."""

import pytest
from django.utils import timezone

from accounts.rbac import Role as R
from content.models import Announcement, DeletionRequest, StaffEntry, StaffGroup, Status
from core.tests.test_permission_matrix import world as fixture_world
from notifications.models import Notification
from organization.models import Department, Program
from students.models import StudentRecord

world = fixture_world

ADMINS = {R.SYSTEM_ADMIN, R.SYSTEM_SUPERVISOR}
# A programme's head and supervisor do, inside their programme, what the department's manager
# and supervisor do inside their department (docs/roles-matrix.md `prog`, owner 2026-11-13);
# the world's student is in theirs.
PROGRAMME = {R.PROGRAM_MANAGER, R.PROGRAM_SUPERVISOR}
APPROVERS = ADMINS | {R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR} | PROGRAMME
SITE = ADMINS | {R.SITE_MANAGER}
STAFF = set(R) - {R.STUDENT}


@pytest.fixture
def extra(world, users, college, make_user):
    """What the new operations act on, beside the matrix's own world."""
    wrong = Department.objects.create(college=college, code="NUR", name_ar="التمريض")
    Program.objects.create(
        department=wrong,
        code="BNUR",
        name_ar="بكالوريوس التمريض",
        degree="bachelor",
        levels_count=4,
        duration_terms=8,
    )
    author = make_user(R.ACADEMIC_AFFAIRS)
    announcement = Announcement.objects.create(
        scope="college",
        audience="staff",
        title="إعلان",
        body="<p>نص</p>",
        status=Status.PUBLISHED,
        publish_at=timezone.now(),
        created_by=author,
    )
    request = DeletionRequest.objects.create(
        kind="announcement",
        object_id=announcement.pk,
        title=announcement.title,
        requested_by=author,
    )
    group = StaffGroup.objects.create(name_ar="مجلس الأمناء", order=9)
    entry = StaffEntry.objects.create(name_ar="أ.د. عمر")
    sent = Notification.objects.create(sender=author, title="تنبيه", body="نص", category="college")
    return {
        **world,
        "wrong": wrong.pk,
        "request": request.pk,
        "group": group.pk,
        "groups": list(StaffGroup.objects.values_list("pk", flat=True)),
        "entry": entry.public_id,
        "sent": sent.public_id,
    }


def _order(e):
    return {"ids": e["groups"]}


# name: (method, url, body, the roles the matrix gives it)
WRITES = {
    "registration-decide": (
        "post",
        "/api/v1/registration-requests/{registration}/decide",
        {"approve": False, "reason": "x"},
        APPROVERS,
    ),
    "identity-report-decide": (
        "post",
        "/api/v1/identity-reports/{identity_report}/decide",
        {"uphold": False, "reason": "x"},
        APPROVERS,
    ),
    "promotion": ("post", "/api/v1/student-promotion", {}, ADMINS | {R.HEAD_REGISTRAR}),
    # A merge deletes: not the system supervisor's.
    "department-merge": (
        "post",
        "/api/v1/departments/{wrong}/merge",
        lambda e: {"into": e["dept"]},
        {R.SYSTEM_ADMIN},
    ),
    "deletion-approve": ("post", "/api/v1/deletion-requests/{request}/approve", {}, ADMINS),
    "deletion-reject": ("post", "/api/v1/deletion-requests/{request}/reject", {}, ADMINS),
    "staff-group-create": ("post", "/api/v1/site-staff/groups", {"name_ar": "جديد"}, SITE),
    "staff-group-update": ("patch", "/api/v1/site-staff/groups/{group}", {"name_en": "X"}, SITE),
    "staff-group-order": ("put", "/api/v1/site-staff/groups/order", _order, SITE),
    "staff-group-delete": (
        "delete",
        "/api/v1/site-staff/groups/{group}",
        None,
        SITE - {R.SYSTEM_SUPERVISOR},
    ),
    "staff-entry-create": ("post", "/api/v1/site-staff/entries", {"name_ar": "شخص"}, SITE),
    "staff-entry-update": ("patch", "/api/v1/site-staff/entries/{entry}", {"title_ar": "د."}, SITE),
    "staff-entry-delete": (
        "delete",
        "/api/v1/site-staff/entries/{entry}",
        None,
        SITE - {R.SYSTEM_SUPERVISOR},
    ),
    "student-create": (
        "post",
        "/api/v1/students",
        lambda e: {"full_name_ar": "طالب جديد", "program": e["program"], "level": 1},
        ADMINS | {R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR} | PROGRAMME,
    ),
    "student-update": (
        "patch",
        "/api/v1/students/{student}",
        {"full_name_en": "Ahmed"},
        ADMINS | {R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR} | PROGRAMME,
    ),
    "student-status": (
        "post",
        "/api/v1/students/{student}/status",
        {"status": "suspended", "reason": "x"},
        ADMINS | {R.STUDENT_AFFAIRS},
    ),
    "own-name": ("patch", "/api/v1/me/name", {"full_name_ar": "اسم مصحّح"}, STAFF),
    # Someone else's sent notification: nobody's but the sender's (and the admins').
    "sent-hide": ("post", "/api/v1/notifications/sent/{sent}/hide", {}, ADMINS),
    "sent-delete": ("delete", "/api/v1/notifications/sent/{sent}", None, ADMINS),
}
# The admins' part in someone else's sent notification is not the matrix's to say.
UNDECIDED = {("sent-hide", R.SYSTEM_ADMIN), ("sent-hide", R.SYSTEM_SUPERVISOR)} | {
    ("sent-delete", R.SYSTEM_ADMIN),
    ("sent-delete", R.SYSTEM_SUPERVISOR),
}
CASES = [(name, role) for name in WRITES for role in R if (name, role) not in UNDECIDED]


def _send(client, extra, name):
    method, url, body, _ = WRITES[name]
    body = body(extra) if callable(body) else body
    return getattr(client, method)(url.format(**extra), body, format="json")


@pytest.mark.parametrize("name,role", CASES, ids=[f"{n}-{r}" for n, r in CASES])
def test_a_new_write_is_refused_to_roles_without_it(name, role, users, api, extra):
    allowed = WRITES[name][3]
    response = _send(api(users[role]), extra, name)
    if role in allowed:
        assert response.status_code not in (401, 403, 404), (
            f"{name}: {role} is given this and got {response.status_code}"
        )
    else:
        assert response.status_code in (403, 404), (
            f"{name}: {role} is not given this and got {response.status_code}"
        )


OUT_OF_SCOPE = ["registration-decide", "identity-report-decide", "student-create", "student-update"]


@pytest.mark.parametrize("name", OUT_OF_SCOPE)
@pytest.mark.parametrize("role", [R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR])
def test_a_department_role_writes_only_in_its_department(
    name, role, make_user, ba_dept, api, extra
):
    response = _send(api(make_user(role, department=ba_dept)), extra, name)
    if name == "student-create":
        # The form only offers the programmes of one's own departments: another's is not a
        # valid choice (400 on the field), and nothing is added.
        assert response.status_code == 400 and "program" in response.data["errors"]
        assert not StudentRecord.objects.filter(full_name_ar="طالب جديد").exists()
        return
    assert response.status_code in (403, 404), f"{name}: {response.status_code}"


def test_me_says_what_each_role_may_delete(api, users, make_user):
    """R73: pages hide their delete buttons by `/me` → `deletes`. The system supervisor holds
    what the admin holds and deletes nothing — unlinking a member or an instructor aside."""

    def deletes(user):
        return set(api(user).get("/api/v1/me").data["deletes"])

    admin, supervisor = deletes(users[R.SYSTEM_ADMIN]), deletes(users[R.SYSTEM_SUPERVISOR])
    assert {"structure.manage", "content.manage", "events.manage", "results.delete"} <= admin
    assert supervisor == {"courses.unassign", "membership.remove"}
    assert "content.manage" in deletes(users[R.SITE_MANAGER])
    assert "structure.manage" not in deletes(users[R.SITE_MANAGER])
    assert deletes(users[R.STUDENT]) == set()
    # Roles add up: a supervisor who is also the site manager deletes what the site manager does.
    both = make_user(R.SYSTEM_SUPERVISOR, R.SITE_MANAGER)
    assert "content.manage" in deletes(both) and "structure.manage" not in deletes(both)


def test_roles_add_up_on_a_delete(api, make_user, extra):
    """The supervisor's «no delete» takes nothing from another role the same person holds."""
    both = make_user(R.SYSTEM_SUPERVISOR, R.SITE_MANAGER)
    assert api(both).delete(f"/api/v1/site-staff/groups/{extra['group']}").status_code == 204
    assert (
        api(both)
        .post(f"/api/v1/departments/{extra['wrong']}/merge", {"into": extra["dept"]}, format="json")
        .status_code
        == 403
    )
