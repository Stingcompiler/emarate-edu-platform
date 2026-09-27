"""Audiences: validate, authorize against the sender's roles (docs/03 §8), resolve to users.

An audience is JSON:
    {"type": "offering",   "ids": [offering ids]}                       students of the course(s)
    {"type": "department", "ids": [...], "members": "students|staff|all", "level": 2?}
    {"type": "program",    "ids": [...], "level": 2?}                   students
    {"type": "college",    "members": "students|staff|all"}
    {"type": "role",       "roles": ["teacher", "ta"], "departments": [ids]?}
    {"type": "users",      "ids": [user public_ids]}
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Q, QuerySet
from rest_framework.exceptions import PermissionDenied, ValidationError

from academic.models import CourseOffering, DepartmentMembership, OfferingInstructor
from accounts import rbac
from accounts.rbac import DEPARTMENT_SCOPED_ROLES, Role
from organization.models import Department, Program

TYPES = {"offering", "department", "program", "college", "role", "users"}
MEMBERS = {"students", "staff", "all"}
STAFF_ROLES = set(Role) - {Role.STUDENT}


def normalize(audience: dict) -> dict:
    """Validate shape; return a clean copy (ids as sorted lists)."""
    if not isinstance(audience, dict) or audience.get("type") not in TYPES:
        raise ValidationError({"audience": [f"type must be one of {sorted(TYPES)}."]})
    kind = audience["type"]
    clean: dict = {"type": kind}
    if kind in {"offering", "department", "program"}:
        ids = audience.get("ids")
        if not ids or not all(isinstance(i, int) for i in ids):
            raise ValidationError({"audience": ["ids: a non-empty list of numbers."]})
        clean["ids"] = sorted(set(ids))
    if kind == "users":
        ids = audience.get("ids")
        if not ids or not all(isinstance(i, str) for i in ids):
            raise ValidationError({"audience": ["ids: a non-empty list of user ids."]})
        clean["ids"] = sorted(set(ids))
    if kind in {"department", "college"}:
        members = audience.get("members", "students")
        if members not in MEMBERS:
            raise ValidationError({"audience": [f"members must be one of {sorted(MEMBERS)}."]})
        clean["members"] = members
    if kind in {"department", "program"} and audience.get("level") is not None:
        level = audience["level"]
        if not isinstance(level, int) or not 1 <= level <= 10:
            raise ValidationError({"audience": ["level must be between 1 and 10."]})
        clean["level"] = level
    if kind == "role":
        roles = audience.get("roles") or []
        if not roles or not set(roles) <= {r.value for r in Role}:
            raise ValidationError({"audience": ["roles: a non-empty list of roles."]})
        clean["roles"] = sorted(set(roles))
        if audience.get("departments"):
            clean["departments"] = sorted(set(audience["departments"]))
    return clean


# ─── Who may send to whom ─────────────────────────────────────────────────


def _departments_of(audience: dict) -> set[int] | None:
    """Departments an audience touches; None = college-wide."""
    kind = audience["type"]
    if kind == "department":
        return set(audience["ids"])
    if kind == "program":
        return set(
            Program.objects.filter(pk__in=audience["ids"]).values_list("department_id", flat=True)
        )
    if kind == "offering":
        return set(
            CourseOffering.objects.filter(pk__in=audience["ids"]).values_list(
                "course__department_id", flat=True
            )
        )
    if kind == "role" and audience.get("departments"):
        return set(audience["departments"])
    return None


def _only_students(user_ids: list[str]) -> bool:
    users = get_user_model().objects.filter(public_id__in=user_ids)
    return (
        users.count() == len(user_ids) and not users.exclude(student_record__isnull=False).exists()
    )


def _students(audience: dict) -> bool:
    kind = audience["type"]
    if kind in {"offering", "program"}:
        return True
    if kind in {"department", "college"}:
        return audience["members"] == "students"
    if kind == "users":
        return _only_students(audience["ids"])
    return False


def is_allowed(sender, audience: dict) -> bool:
    roles = rbac.roles_of(sender)
    kind = audience["type"]
    if Role.SYSTEM_ADMIN in roles:
        return True
    departments = _departments_of(audience)

    if roles & {Role.SITE_MANAGER, Role.EVENTS_MANAGER} and kind == "college":
        return True
    # Head registrar: students by group; student affairs: also individual students.
    if (
        roles & {Role.HEAD_REGISTRAR, Role.STUDENT_AFFAIRS}
        and _students(audience)
        and (kind != "users" or Role.STUDENT_AFFAIRS in roles)
    ):
        return True
    if Role.HEAD_REGISTRAR in roles and kind == "role" and set(audience["roles"]) <= {"registrar"}:
        return True
    if Role.ACADEMIC_AFFAIRS in roles:
        if kind == "role" and set(audience["roles"]) <= {"teacher", "ta"}:
            return True
        if kind == "department" and audience["members"] == "staff":
            return True
    # Department manager / supervisor: anything inside their departments.
    scope = rbac.scope_for(sender, "learning.manage")
    if (
        departments
        and kind in {"department", "program", "offering"}
        and all(scope.allows(d) for d in departments)
    ):
        return True
    # Teachers (and TAs with permission): students of the courses they teach.
    if kind == "offering":
        teaching = OfferingInstructor.objects.filter(
            user=sender, offering_id__in=audience["ids"]
        ).select_related("offering")
        allowed = {
            t.offering_id
            for t in teaching
            if t.role == "teacher" or (t.role == "ta" and t.offering.ta_can_notify)
        }
        if allowed >= set(audience["ids"]):
            return True
    return False


def authorize(sender, audience: dict) -> dict:
    clean = normalize(audience)
    if not is_allowed(sender, clean):
        raise PermissionDenied("This audience is outside what you may notify.")
    return clean


# ─── Resolution ───────────────────────────────────────────────────────────


def _student_users(q: Q) -> Q:
    return Q(student_record__status="active") & q


def resolve(audience: dict) -> QuerySet:
    User = get_user_model()
    kind = audience["type"]
    level = audience.get("level")
    level_q = Q(student_record__level=level) if level else Q()
    if kind == "offering":
        q = _student_users(
            Q(
                student_record__enrollments__offering__in=audience["ids"],
                student_record__enrollments__status="active",
            )
        )
    elif kind == "program":
        q = _student_users(Q(student_record__program__in=audience["ids"]) & level_q)
    elif kind == "department":
        students = _student_users(Q(student_record__department__in=audience["ids"]) & level_q)
        member_ids = DepartmentMembership.objects.filter(department__in=audience["ids"]).values(
            "user_id"
        )
        staff = Q(pk__in=member_ids) | Q(
            role_assignments__role__in=sorted(DEPARTMENT_SCOPED_ROLES),
            role_assignments__department__in=audience["ids"],
        )
        q = {"students": students, "staff": staff, "all": students | staff}[audience["members"]]
    elif kind == "college":
        students = _student_users(Q(student_record__isnull=False))
        staff = Q(role_assignments__role__in=sorted(STAFF_ROLES))
        q = {"students": students, "staff": staff, "all": students | staff}[audience["members"]]
    elif kind == "role":
        q = Q(role_assignments__role__in=audience["roles"])
        if audience.get("departments"):
            members = DepartmentMembership.objects.filter(
                department__in=audience["departments"]
            ).values("user_id")
            q &= Q(role_assignments__department__in=audience["departments"]) | Q(pk__in=members)
    else:  # users
        q = Q(public_id__in=audience["ids"])
    ids = User.objects.filter(q, is_active=True).values("pk")
    return User.objects.filter(pk__in=ids)


# ─── What the sender may pick from (for the compose screen) ───────────────


def options(sender) -> list[dict]:
    """Ready-made audiences for the compose form, limited to the sender's scope.

    ``group`` lets the form show one radio per group: single audiences
    (college, department, staff) directly, cohorts and courses as a picker.
    Cohorts with nobody to reach are left out.
    """
    roles = rbac.roles_of(sender)
    found: list[dict] = []

    def add(group: str, label: str, audience: dict, *, keep_empty: bool = True) -> None:
        clean = normalize(audience)
        if not is_allowed(sender, clean):
            return
        count = resolve(clean).count()
        if count or keep_empty:
            found.append({"group": group, "label": label, "audience": clean, "count": count})

    if roles & {Role.SYSTEM_ADMIN, Role.SITE_MANAGER, Role.EVENTS_MANAGER}:
        add("college", "كل مستخدمي الكلية", {"type": "college", "members": "all"})
    if roles & {Role.SYSTEM_ADMIN, Role.HEAD_REGISTRAR, Role.STUDENT_AFFAIRS}:
        add("college", "كل طلاب الكلية", {"type": "college", "members": "students"})
    if roles & {Role.SYSTEM_ADMIN, Role.ACADEMIC_AFFAIRS}:
        add("staff", "كل الأساتذة والمعيدين", {"type": "role", "roles": ["teacher", "ta"]})

    scope = rbac.scope_for(sender, "learning.manage")
    if not scope.none and not scope.everything:
        for department in Department.objects.filter(pk__in=scope.departments):
            add(
                "department",
                f"كل طلاب قسم {department.name_ar}",
                {"type": "department", "ids": [department.pk]},
            )
            for program in department.programs.filter(is_active=True):
                for level in range(1, program.levels_count + 1):
                    add(
                        "cohort",
                        f"{program.name_ar} — المستوى {level}",
                        {"type": "program", "ids": [program.pk], "level": level},
                        keep_empty=False,
                    )
            for offering in CourseOffering.objects.filter(
                course__department=department, term__is_current=True
            ).select_related("course"):
                add(
                    "course",
                    f"{offering.course.code} — {offering.course.name_ar} ({offering.section})",
                    {"type": "offering", "ids": [offering.pk]},
                    keep_empty=False,
                )
            add(
                "staff",
                f"أساتذة ومعيدو قسم {department.name_ar}",
                {"type": "department", "ids": [department.pk], "members": "staff"},
            )
    teaching = OfferingInstructor.objects.filter(
        user=sender, offering__term__is_current=True
    ).select_related("offering__course")
    listed = {tuple(o["audience"].get("ids", [])) for o in found if o["group"] == "course"}
    for row in teaching:
        offering = row.offering
        if (offering.pk,) not in listed:
            add(
                "course",
                f"{offering.course.code} — {offering.course.name_ar} ({offering.section})",
                {"type": "offering", "ids": [offering.pk]},
            )
    return found
