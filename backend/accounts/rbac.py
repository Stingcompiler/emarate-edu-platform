"""Roles, scopes and capabilities — the single source of truth for authorization.

docs/03-roles-and-permissions.md is the authority; this module encodes it.

* A **role** is held through a ``RoleAssignment`` row. Registrar, department
  manager and department supervisor are *department-scoped* (one row per
  department); every other role is college-wide.
* A **capability** is a named action (``"courses.manage"``). Each capability
  lists the roles that have it; college-wide roles get it everywhere,
  department-scoped roles only inside their departments.
* ``scope_for(user, capability)`` answers "where may this user do this?" as a
  ``Scope`` (everything, or a set of department ids). Views and selectors use
  it to check a single object or to filter a queryset.

Server-side only: the portal may hide buttons, but every endpoint checks here.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from django.db import models
from django.db.models import Q, QuerySet


class Role(models.TextChoices):
    SYSTEM_ADMIN = "system_admin", "مدير النظام"
    HEAD_REGISTRAR = "head_registrar", "مسؤول المسجلين"
    REGISTRAR = "registrar", "مسجل قسم"
    RESULTS_OFFICER = "results_officer", "مسؤول النتائج"
    ACADEMIC_AFFAIRS = "academic_affairs", "أمين الشؤون العلمية"
    STUDENT_AFFAIRS = "student_affairs", "أمين شؤون الطلاب"
    DEPARTMENT_MANAGER = "department_manager", "مدير القسم"
    DEPARTMENT_SUPERVISOR = "department_supervisor", "مشرف القسم"
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
    "courses.delete": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER}),
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
    # Website content (docs/03 §3.12–3.13)
    "content.manage": frozenset({R.SYSTEM_ADMIN, R.SITE_MANAGER}),
    "events.manage": frozenset({R.SYSTEM_ADMIN, R.SITE_MANAGER, R.EVENTS_MANAGER}),
    # Users and roles
    "users.view": frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.HEAD_REGISTRAR}),
    # Audit log: system admin sees everything; department roles their department.
    "audit.view": frozenset({R.SYSTEM_ADMIN, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}),
}

# Who may grant (and revoke) which role (docs/03 §6).
GRANTS: dict[Role, frozenset[Role]] = {
    R.SYSTEM_ADMIN: frozenset(Role),
    R.HEAD_REGISTRAR: frozenset({R.REGISTRAR}),
    R.ACADEMIC_AFFAIRS: frozenset({R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR, R.TEACHER, R.TA}),
    R.SITE_MANAGER: frozenset({R.EVENTS_MANAGER}),
}

# Staff accounts each role may create (docs/03 §7 "المستخدمون").
CREATABLE_ACCOUNTS: dict[Role, frozenset[Role]] = {
    R.SYSTEM_ADMIN: frozenset(Role) - {R.STUDENT},  # students come from records
    R.ACADEMIC_AFFAIRS: frozenset({R.TEACHER, R.TA}),
}


@dataclass(frozen=True)
class Scope:
    """Where a user may exercise a capability."""

    everything: bool = False
    departments: frozenset[int] = field(default_factory=frozenset)

    @property
    def none(self) -> bool:
        return not self.everything and not self.departments

    def allows(self, department_id: int | None) -> bool:
        if self.everything:
            return True
        return department_id is not None and department_id in self.departments

    def filter(self, queryset: QuerySet, department_field: str) -> QuerySet:
        """Restrict ``queryset`` to rows whose department is in scope."""
        if self.everything:
            return queryset
        if not self.departments:
            return queryset.none()
        return queryset.filter(**{f"{department_field}__in": self.departments})

    def q(self, department_field: str) -> Q:
        if self.everything:
            # Not Q(): an empty Q vanishes when OR-ed with another condition.
            return Q(pk__isnull=False)
        return (
            Q(**{f"{department_field}__in": self.departments}) if self.departments else Q(pk__in=[])
        )


def _assignments(user) -> list[tuple[str, int | None]]:
    """(role, department_id) pairs for ``user``, cached on the instance per request."""
    if user is None or not user.is_authenticated or not user.is_active:
        return []
    cached = getattr(user, "_rbac_assignments", None)
    if cached is None:
        cached = list(user.role_assignments.values_list("role", "department_id"))
        user._rbac_assignments = cached
    return cached


def clear_cache(user) -> None:
    if hasattr(user, "_rbac_assignments"):
        del user._rbac_assignments


def roles_of(user) -> set[str]:
    return {role for role, _ in _assignments(user)}


def has_role(user, *roles: Role) -> bool:
    held = roles_of(user)
    return any(role in held for role in roles)


def scope_for(user, capability: str) -> Scope:
    allowed = CAPABILITIES[capability]
    departments: set[int] = set()
    for role, department_id in _assignments(user):
        if role not in allowed:
            continue
        if role in DEPARTMENT_SCOPED_ROLES:
            if department_id is not None:
                departments.add(department_id)
        else:
            return Scope(everything=True)
    return Scope(departments=frozenset(departments))


def can(user, capability: str, department_id: int | None = None) -> bool:
    """True if ``user`` holds ``capability`` for ``department_id`` (or anywhere, if None)."""
    scope = scope_for(user, capability)
    if department_id is None:
        return not scope.none
    return scope.allows(department_id)


def grantable_roles(user) -> frozenset[Role]:
    granted: set[Role] = set()
    for role in roles_of(user):
        granted |= GRANTS.get(Role(role), frozenset())
    return frozenset(granted)


def creatable_accounts(user) -> frozenset[Role]:
    creatable: set[Role] = set()
    for role in roles_of(user):
        creatable |= CREATABLE_ACCOUNTS.get(Role(role), frozenset())
    return frozenset(creatable)


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
