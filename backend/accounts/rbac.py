"""Roles, scopes and capabilities — the single source of truth for authorization.

docs/03-roles-and-permissions.md is the authority; this module encodes it.

* A **role** is held through a ``RoleAssignment`` row. Registrar, department
  manager and department supervisor are *department-scoped* (one row per
  department); programme head and programme supervisor are *programme-scoped*
  (one row per programme); every other role is college-wide.
* A **capability** is a named action (``"courses.manage"``). Each capability
  lists the roles that have it; college-wide roles get it everywhere,
  department-scoped roles only inside their departments, programme-scoped
  roles only inside their programmes.
* ``scope_for(user, capability)`` answers "where may this user do this?" as a
  ``Scope`` (everything, or department ids and programme ids). Views and
  selectors use it to check a single object or to filter a queryset.

The department is a container (owner, 2026-11-13): courses, lectures and
students live in a programme, and the programme's head runs them. A department
head, where one is appointed, runs every programme of the department.

Server-side only: the portal may hide buttons, but every endpoint checks here.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from django.db import models
from django.db.models import Q, QuerySet


class Role(models.TextChoices):
    SYSTEM_ADMIN = "system_admin", "مدير النظام"
    # Stands in for the system admin (owner, 2026-11-05): every capability of the admin except
    # deleting anything; approves deletion requests (announcements, sent notifications).
    SYSTEM_SUPERVISOR = "system_supervisor", "مشرف النظام"
    HEAD_REGISTRAR = "head_registrar", "مسؤول المسجلين"
    REGISTRAR = "registrar", "مسجل قسم"
    RESULTS_OFFICER = "results_officer", "مسؤول النتائج"
    ACADEMIC_AFFAIRS = "academic_affairs", "أمين الشؤون العلمية"
    STUDENT_AFFAIRS = "student_affairs", "أمين شؤون الطلاب"
    DEPARTMENT_MANAGER = "department_manager", "مدير القسم"
    DEPARTMENT_SUPERVISOR = "department_supervisor", "مشرف القسم"
    # The head of one programme and their supervisor (owner, 2026-11-13): what the department
    # manager and supervisor do, inside the programme.
    PROGRAM_MANAGER = "program_manager", "رئيس البرنامج"
    PROGRAM_SUPERVISOR = "program_supervisor", "مشرف البرنامج"
    TEACHER = "teacher", "أستاذ"
    TA = "ta", "معيد"
    STUDENT = "student", "طالب"
    HR = "hr", "الموارد البشرية"
    SITE_MANAGER = "site_manager", "مدير الموقع"
    EVENTS_MANAGER = "events_manager", "مدير الفعاليات"


# Roles that must be tied to a department (docs/03 §10).
DEPARTMENT_SCOPED_ROLES = frozenset(
    {Role.REGISTRAR, Role.DEPARTMENT_MANAGER, Role.DEPARTMENT_SUPERVISOR}
)

# Roles that must be tied to a programme.
PROGRAM_SCOPED_ROLES = frozenset({Role.PROGRAM_MANAGER, Role.PROGRAM_SUPERVISOR})

R = Role
# Capability → roles holding it. Department-scoped roles hold it within their
# departments only. Keep this table aligned with docs/03 §7.
CAPABILITIES: dict[str, frozenset[Role]] = {
    # System
    "settings.manage": frozenset({R.SYSTEM_ADMIN}),
    # Academic structure: colleges, departments, programs, years, terms
    "structure.manage": frozenset({R.SYSTEM_ADMIN}),
    "structure.view": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.HR,  # term and department filters of the teacher reports
            R.HEAD_REGISTRAR,
            R.REGISTRAR,
            R.RESULTS_OFFICER,
            R.ACADEMIC_AFFAIRS,
            R.STUDENT_AFFAIRS,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    # Course catalogue, offerings and instructor assignments
    "courses.view": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.HEAD_REGISTRAR,
            R.ACADEMIC_AFFAIRS,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    "courses.manage": frozenset(
        {R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    # Supervisor = manager minus any delete/removal (docs/02 D13).
    # Academic affairs removes assignments, never a course or an offering (docs/03 §7 «الحذف»;
    # review 2026-10-25).
    "courses.delete": frozenset({R.SYSTEM_ADMIN, R.DEPARTMENT_MANAGER}),
    "courses.unassign": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER}),
    # Teachers / TAs belonging to a department
    "membership.manage": frozenset(
        {R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    "membership.remove": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER}),
    # Student records
    "students.view": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.HEAD_REGISTRAR,
            R.STUDENT_AFFAIRS,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    "students.import": frozenset({R.SYSTEM_ADMIN, R.HEAD_REGISTRAR}),
    # Move the students on a semester at the end of a term (owner, 2026-11-05).
    "students.promote": frozenset({R.SYSTEM_ADMIN, R.HEAD_REGISTRAR}),
    # Add and correct records by hand; a department role in its departments only
    # (owner 2026-09-29: the department manager runs their department's students).
    "students.manage": frozenset(
        {R.SYSTEM_ADMIN, R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    # A record added by mistake; never one with an account or history (students/services).
    "students.delete": frozenset({R.SYSTEM_ADMIN, R.DEPARTMENT_MANAGER}),
    "registration.approve": frozenset(
        {R.SYSTEM_ADMIN, R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    "enrollment.manage": frozenset(
        {R.SYSTEM_ADMIN, R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    # Lectures, assignments and grading, beyond a user's own teaching (docs/03 §7).
    # Teachers/TAs act on the offerings they are assigned to (learning.access).
    "learning.view": frozenset(
        {R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    "learning.manage": frozenset({R.SYSTEM_ADMIN, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}),
    "learning.delete": frozenset({R.SYSTEM_ADMIN, R.DEPARTMENT_MANAGER}),
    # Results (docs/03 §3.4): the file is the source; corrections need approval.
    "results.manage": frozenset(
        {R.SYSTEM_ADMIN, R.RESULTS_OFFICER, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    # Removing an uncommitted batch: the supervisor deletes nothing (docs/03 §3.7, §7 «الحذف»).
    "results.delete": frozenset({R.SYSTEM_ADMIN, R.RESULTS_OFFICER, R.DEPARTMENT_MANAGER}),
    "results.view": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.HEAD_REGISTRAR,
            R.RESULTS_OFFICER,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    "results.correct": frozenset({R.SYSTEM_ADMIN, R.RESULTS_OFFICER}),
    "results.approve": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS}),
    "results.settings": frozenset({R.SYSTEM_ADMIN, R.RESULTS_OFFICER}),
    # Reading them: the head registrar too; department roles not (docs/03 §7; review R13).
    "results.settings_view": frozenset({R.SYSTEM_ADMIN, R.HEAD_REGISTRAR, R.RESULTS_OFFICER}),
    # Student affairs (docs/03 §3.14)
    "regulations.manage": frozenset({R.SYSTEM_ADMIN, R.STUDENT_AFFAIRS}),
    "cases.manage": frozenset({R.SYSTEM_ADMIN, R.STUDENT_AFFAIRS}),
    "cases.view": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.STUDENT_AFFAIRS,
            R.HEAD_REGISTRAR,
            R.ACADEMIC_AFFAIRS,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    "students.status": frozenset({R.SYSTEM_ADMIN, R.STUDENT_AFFAIRS}),
    # Admissions (docs/03 §3.2–3.3): the head registrar runs admissions; registrars
    # review their departments; department manager/supervisor read summaries.
    "admissions.manage": frozenset({R.SYSTEM_ADMIN, R.HEAD_REGISTRAR}),
    "admissions.review": frozenset({R.SYSTEM_ADMIN, R.HEAD_REGISTRAR, R.REGISTRAR}),
    "admissions.view": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.HEAD_REGISTRAR,
            R.REGISTRAR,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    # Reports (docs/02 §4.14). Department roles read their departments only.
    "reports.department": frozenset(
        {R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    ),
    "reports.teachers": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.ACADEMIC_AFFAIRS,
            R.HR,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    # docs/03 §7 «تقارير القبول/الطلاب»: the registrar, manager and supervisor see their
    # departments (review 2026-10-25 decisions, item 7).
    "reports.admissions": frozenset(
        {
            R.SYSTEM_ADMIN,
            R.HEAD_REGISTRAR,
            R.REGISTRAR,
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
        }
    ),
    "reports.affairs": frozenset({R.SYSTEM_ADMIN, R.STUDENT_AFFAIRS}),
    # HR notices (docs/03 §3.11): one teacher at a time, never broadcast.
    "hr.view": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.HR}),
    "hr.notify": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.HR}),
    # Website content (docs/03 §3.12–3.13)
    "content.manage": frozenset({R.SYSTEM_ADMIN, R.SITE_MANAGER}),
    "events.manage": frozenset({R.SYSTEM_ADMIN, R.SITE_MANAGER, R.EVENTS_MANAGER}),
    # News: the site team; the events manager only news linked to an event (docs/03 §3.13).
    "news.manage": frozenset({R.SYSTEM_ADMIN, R.SITE_MANAGER, R.EVENTS_MANAGER}),
    # Hides a staff photo or qualification from the site's «الكوادر» (owner, 2026-10-30).
    "staff_profiles.moderate": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS}),
    # Adds people to the site's «الكوادر» (never an account) and sorts them into groups on a
    # matrix (owner, 2026-11-09: «اجعل إدارة النظام والموقع قادرين على إضافة كوادر»).
    "site_staff.manage": frozenset({R.SYSTEM_ADMIN, R.SITE_MANAGER}),
    # Users and roles
    "users.view": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.HEAD_REGISTRAR}),
    # Sets a temporary password for another account (the owner's request, 2026-10-13).
    "users.reset_password": frozenset({R.SYSTEM_ADMIN}),
    # Changes a staff member's display name (owner request 2026-10-13).
    "users.rename": frozenset({R.SYSTEM_ADMIN}),
    # Deletes an account that never did anything (owner request 2026-10-13); one with history
    # is disabled instead, because the audit log keeps its actors for good (docs/03).
    "users.delete": frozenset({R.SYSTEM_ADMIN}),
    # Audit log: system admin sees everything; department roles their department.
    "audit.view": frozenset({R.SYSTEM_ADMIN, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}),
    # The log of one's own field of work (docs/03 §7 «سجل التدقيق» ◐; review 2026-10-25
    # decisions, item 8): which actions belong to which role is audit.views.DOMAINS.
    "audit.domain": frozenset(
        {
            R.SYSTEM_ADMIN,  # holds every capability; already sees the whole log
            R.HEAD_REGISTRAR,
            R.REGISTRAR,
            R.RESULTS_OFFICER,
            R.ACADEMIC_AFFAIRS,
            R.SITE_MANAGER,
        }
    ),
}

# Approves (or refuses) a request to delete an announcement or a sent notification.
CAPABILITIES["deletions.approve"] = frozenset({R.SYSTEM_ADMIN})

# The system supervisor holds what the admin holds, but no capability that deletes; and the
# DELETE method never counts its role (scope_for(..., deleting=True)).
DELETING = frozenset(name for name in CAPABILITIES if name.endswith(".delete"))
for _name, _roles in list(CAPABILITIES.items()):
    if R.SYSTEM_ADMIN in _roles and _name not in DELETING:
        CAPABILITIES[_name] = _roles | {R.SYSTEM_SUPERVISOR}

# The programme's head and supervisor hold, inside their programme, what the department's
# manager and supervisor hold inside their department — where the endpoints know a programme
# (PROGRAMME_CAPABILITIES; the rest follow as their endpoints learn it).
PROGRAMME_CAPABILITIES = frozenset(
    {
        "structure.view",
        "courses.view",
        "courses.manage",
        "courses.delete",
        "courses.unassign",
        "membership.manage",
        "membership.remove",
        "students.view",
        "students.manage",
        "students.delete",
        "registration.approve",
        "enrollment.manage",
        "learning.view",
        "learning.manage",
        "learning.delete",
        # Results: reading them, and uploading the programme's own file.
        "results.view",
        "results.manage",
        "results.delete",
        "cases.view",
        "admissions.view",
        # The programme's own report and its staff's indicators.
        "reports.department",
        "reports.teachers",
        "reports.admissions",
        # The log of what happened in the programme (entries carry it since 2026-11-13).
        "audit.view",
    }
)
for _name in PROGRAMME_CAPABILITIES:
    _roles = CAPABILITIES[_name]
    if R.DEPARTMENT_MANAGER in _roles:
        _roles = _roles | {R.PROGRAM_MANAGER}
    if R.DEPARTMENT_SUPERVISOR in _roles:
        _roles = _roles | {R.PROGRAM_SUPERVISOR}
    CAPABILITIES[_name] = _roles

# Removing a member from a department or a teacher from a course unlinks; nothing is deleted.
# The DELETE method that does it counts the supervisor (docs/roles-matrix.md: SS `all`).
UNLINKING = frozenset({"courses.unassign", "membership.remove"})

# Roles above the supervisor: it never grants them or acts on their accounts.
TOP_ROLES = frozenset({R.SYSTEM_ADMIN, R.SYSTEM_SUPERVISOR})

# Who may grant (and revoke) which role (docs/03 §6).
GRANTS: dict[Role, frozenset[Role]] = {
    R.SYSTEM_ADMIN: frozenset(Role),
    R.SYSTEM_SUPERVISOR: frozenset(Role) - TOP_ROLES,
    R.HEAD_REGISTRAR: frozenset({R.REGISTRAR}),
    R.ACADEMIC_AFFAIRS: frozenset(
        {
            R.DEPARTMENT_MANAGER,
            R.DEPARTMENT_SUPERVISOR,
            R.PROGRAM_MANAGER,
            R.PROGRAM_SUPERVISOR,
            R.TEACHER,
            R.TA,
        }
    ),
    R.SITE_MANAGER: frozenset({R.EVENTS_MANAGER}),
}

# Staff accounts each role may create (docs/03 §7 "المستخدمون"). Academic affairs no longer
# creates accounts: it appoints from existing ones (owner, 2026-11-12).
CREATABLE_ACCOUNTS: dict[Role, frozenset[Role]] = {
    R.SYSTEM_ADMIN: frozenset(Role) - {R.STUDENT},  # students come from records
    R.SYSTEM_SUPERVISOR: frozenset(Role) - {R.STUDENT} - TOP_ROLES,
}

# Accounts each role may disable and enable again: those it creates, and for academic affairs
# the teaching accounts it used to create (owner, 2026-11-12: it keeps this).
ACTIVATABLE_ACCOUNTS: dict[Role, frozenset[Role]] = {
    **CREATABLE_ACCOUNTS,
    R.ACADEMIC_AFFAIRS: frozenset({R.TEACHER, R.TA}),
}


# The two tables above as capabilities, so the approved matrix has a row for each and /me
# names them (owner, 2026-11-10): whoever a table gives anything to holds the capability;
# which roles they may create or grant stays the table's to say.
CAPABILITIES["users.create"] = frozenset(CREATABLE_ACCOUNTS)
CAPABILITIES["roles.grant"] = frozenset(GRANTS)


@dataclass(frozen=True)
class Scope:
    """Where a user may exercise a capability."""

    everything: bool = False
    departments: frozenset[int] = field(default_factory=frozenset)
    # Programmes held one by one (programme head / supervisor). A department in
    # ``departments`` covers every programme of it.
    programs: frozenset[int] = field(default_factory=frozenset)

    @property
    def none(self) -> bool:
        return not self.everything and not self.departments and not self.programs

    def allows(self, department_id: int | None, program_id: int | None = None) -> bool:
        """``program_id``: the programme the object belongs to, where it has one. Without it a
        programme-scoped role is refused: it holds programmes, never a whole department."""
        if self.everything:
            return True
        if department_id is not None and department_id in self.departments:
            return True
        return program_id is not None and program_id in self.programs

    def q(self, department_field: str, program_field: str | None = None) -> Q:
        """Rows in scope. ``program_field`` is the path to the row's programme; a list that
        gives none shows a programme-scoped role nothing."""
        if self.everything:
            # Not Q(): an empty Q vanishes when OR-ed with another condition.
            return Q(pk__isnull=False)
        q = Q(pk__in=[])
        if self.departments:
            q |= Q(**{f"{department_field}__in": self.departments})
        if self.programs and program_field:
            q |= Q(**{f"{program_field}__in": self.programs})
        return q

    def filter(
        self, queryset: QuerySet, department_field: str, program_field: str | None = None
    ) -> QuerySet:
        """Restrict ``queryset`` to rows whose department or programme is in scope."""
        if self.everything:
            return queryset
        if not self.departments and not (self.programs and program_field):
            return queryset.none()
        return queryset.filter(self.q(department_field, program_field))


def _assignments(user) -> list[tuple[str, int | None, int | None]]:
    """(role, department_id, program_id) for ``user``, cached on the instance per request."""
    if user is None or not user.is_authenticated or not user.is_active:
        return []
    cached = getattr(user, "_rbac_assignments", None)
    if cached is None:
        cached = list(user.role_assignments.values_list("role", "department_id", "program_id"))
        user._rbac_assignments = cached
    return cached


def clear_cache(user) -> None:
    if hasattr(user, "_rbac_assignments"):
        del user._rbac_assignments


def roles_of(user) -> set[str]:
    return {role for role, *_ in _assignments(user)}


def is_admin(user, *, deleting: bool = False) -> bool:
    """The system admin, or (unless deleting) the system supervisor who stands in for them."""
    roles = (Role.SYSTEM_ADMIN,) if deleting else (Role.SYSTEM_ADMIN, Role.SYSTEM_SUPERVISOR)
    return has_role(user, *roles)


def has_role(user, *roles: Role) -> bool:
    held = roles_of(user)
    return any(role in held for role in roles)


def takes_part(user) -> bool:
    """Teaches, assists or studies: a course's own pages open by assignment or enrollment,
    whatever the central capabilities say (docs/roles-matrix.md leaves PROF/TA/STD to that)."""
    if has_role(user, Role.TEACHER, Role.TA, Role.STUDENT):
        return True
    from academic.models import OfferingInstructor
    from students.models import StudentRecord

    return (
        OfferingInstructor.objects.filter(user=user).exists()
        or StudentRecord.objects.filter(user=user).exists()
    )


def has_role_in(user, role: Role, department_id: int | None) -> bool:
    """True if ``user`` holds ``role`` for exactly this department."""
    return department_id is not None and any(
        held == role and department == department_id for held, department, _ in _assignments(user)
    )


def scope_for(user, capability: str, *, deleting: bool = False) -> Scope:
    """`deleting`: the request deletes something; the system supervisor's role does not count
    (it stands in for the admin in everything but deleting — owner, 2026-11-05)."""
    allowed = CAPABILITIES[capability]
    deleting = deleting and capability not in UNLINKING
    departments: set[int] = set()
    programs: set[int] = set()
    for role, department_id, program_id in _assignments(user):
        if role not in allowed or (deleting and role == Role.SYSTEM_SUPERVISOR):
            continue
        if role in PROGRAM_SCOPED_ROLES:
            if program_id is not None:
                programs.add(program_id)
        elif role in DEPARTMENT_SCOPED_ROLES:
            if department_id is not None:
                departments.add(department_id)
        else:
            return Scope(everything=True)
    return Scope(departments=frozenset(departments), programs=frozenset(programs))


def can(
    user,
    capability: str,
    department_id: int | None = None,
    program_id: int | None = None,
    *,
    deleting: bool = False,
) -> bool:
    """True if ``user`` holds ``capability`` for this department or this programme of it (or
    anywhere, when neither is given)."""
    scope = scope_for(user, capability, deleting=deleting)
    if department_id is None and program_id is None:
        return not scope.none
    return scope.allows(department_id, program_id)


def can_for(user, capability: str, obj, *, deleting: bool = False) -> bool:
    """``can`` for something that lives in a programme: a course, a student record, an
    offering, a membership — anything with ``department_id`` and ``program_id``."""
    return can(user, capability, obj.department_id, obj.program_id, deleting=deleting)


def grantable_roles(user) -> frozenset[Role]:
    granted: set[Role] = set()
    for role in roles_of(user):
        granted |= GRANTS.get(Role(role), frozenset())
    return frozenset(granted)


def _held(table: dict[Role, frozenset[Role]], user) -> frozenset[Role]:
    found: set[Role] = set()
    for role in roles_of(user):
        found |= table.get(Role(role), frozenset())
    return frozenset(found)


def creatable_accounts(user) -> frozenset[Role]:
    return _held(CREATABLE_ACCOUNTS, user)


def activatable_accounts(user) -> frozenset[Role]:
    return _held(ACTIVATABLE_ACCOUNTS, user)


def capabilities_of(user) -> dict[str, Scope]:
    """Flattened view for /me: every capability the user holds and its scope."""
    result = {}
    for name in CAPABILITIES:
        scope = scope_for(user, name)
        if not scope.none:
            result[name] = scope
    return result


def ensure_known(capabilities: Iterable[str]) -> None:
    unknown = set(capabilities) - set(CAPABILITIES)
    if unknown:
        raise KeyError(f"Unknown capabilities: {sorted(unknown)}")
