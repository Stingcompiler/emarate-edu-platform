"""Content permissions, announcement audiences and the site rebuild hook."""

from __future__ import annotations

import logging
import urllib.request

from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.exceptions import PermissionDenied

from academic.models import CourseOffering, DepartmentMembership, Enrollment, OfferingInstructor
from accounts import rbac
from accounts.rbac import DEPARTMENT_SCOPED_ROLES, Role
from organization.models import Program
from students.models import StudentRecord

from .models import Announcement, Status

log = logging.getLogger(__name__)
A = Announcement


def department_of(scope: str, scope_id: int | None) -> int | None:
    if scope == A.Scope.DEPARTMENT:
        return scope_id
    if scope == A.Scope.PROGRAM:
        return Program.objects.filter(pk=scope_id).values_list("department_id", flat=True).first()
    if scope == A.Scope.OFFERING:
        return (
            CourseOffering.objects.filter(pk=scope_id)
            .values_list("course__department_id", flat=True)
            .first()
        )
    return None


def may_announce(user, scope: str, scope_id: int | None, audience: str) -> bool:
    """docs/03 §7 «إعلانات»: who may address which scope and audience."""
    roles = rbac.roles_of(user)
    if Role.SYSTEM_ADMIN in roles:
        return True
    college = scope == A.Scope.COLLEGE
    if college and Role.SITE_MANAGER in roles:
        return True
    if (
        college
        and Role.EVENTS_MANAGER in roles
        and audience in (A.Audience.PUBLIC, A.Audience.ALL_INTERNAL)
    ):
        return True
    if (
        Role.HEAD_REGISTRAR in roles
        and audience == A.Audience.STUDENTS
        and scope != A.Scope.OFFERING
    ):
        return True
    if (
        Role.ACADEMIC_AFFAIRS in roles
        and audience == A.Audience.STAFF
        and scope in (A.Scope.COLLEGE, A.Scope.DEPARTMENT)
    ):
        return True
    department = department_of(scope, scope_id)
    if (
        department
        and audience != A.Audience.PUBLIC
        and rbac.can(user, "learning.manage", department)
    ):
        return True
    # Owner decision 2026-09-30: a department manager publishes their department's news on
    # its public page (department scope only — the college-wide site stays the site team's).
    if (
        scope == A.Scope.DEPARTMENT
        and audience == A.Audience.PUBLIC
        and rbac.has_role_in(user, Role.DEPARTMENT_MANAGER, scope_id)
    ):
        return True
    if scope == A.Scope.OFFERING and audience == A.Audience.STUDENTS:
        row = (
            OfferingInstructor.objects.filter(offering=scope_id, user=user)
            .select_related("offering")
            .first()
        )
        if row and (row.role == "teacher" or row.offering.ta_can_notify):
            return True
    return False


# College-wide roles that address a department through their own branch of may_announce.
_COLLEGE_ANNOUNCERS = frozenset(
    {
        Role.SYSTEM_ADMIN,
        Role.SITE_MANAGER,
        Role.EVENTS_MANAGER,
        Role.HEAD_REGISTRAR,
        Role.ACADEMIC_AFFAIRS,
    }
)


def may_delete_announcement(user, announcement) -> bool:
    """Deleting is narrower than announcing (docs/03 §3.7, §3.9, §7 «الحذف»): a supervisor or a
    TA never deletes; a teacher removes only their own course announcement."""
    if not may_announce(user, announcement.scope, announcement.scope_id, announcement.audience):
        return False
    department = department_of(announcement.scope, announcement.scope_id)
    if department is None or rbac.roles_of(user) & _COLLEGE_ANNOUNCERS:
        return True
    if rbac.can(user, "learning.delete", department):
        return True
    return (
        announcement.scope == A.Scope.OFFERING
        and announcement.created_by_id == user.pk
        and OfferingInstructor.objects.filter(
            offering=announcement.scope_id, user=user, role="teacher"
        ).exists()
    )


def require_announce(user, scope, scope_id, audience) -> None:
    if not may_announce(user, scope, scope_id, audience):
        raise PermissionDenied(
            gettext("This scope or audience is outside what you may announce to.")
        )


def live_q(now=None) -> Q:
    now = now or timezone.now()
    return (
        Q(status=Status.PUBLISHED)
        & (Q(publish_at__isnull=True) | Q(publish_at__lte=now))
        & (Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    )


def feed_q(user) -> Q:
    """Published announcements this user should see in the portal."""
    record_ = StudentRecord.objects.filter(user=user).first()
    is_student = record_ is not None
    staff_roles = rbac.roles_of(user) - {Role.STUDENT}
    departments: set[int] = set()
    programs: set[int] = set()
    offerings: set[int] = set()
    if record_:
        departments.add(record_.department_id)
        programs.add(record_.program_id)
        offerings |= set(
            Enrollment.objects.filter(student_record=record_, status="active").values_list(
                "offering_id", flat=True
            )
        )
    departments |= set(
        DepartmentMembership.objects.filter(user=user).values_list("department_id", flat=True)
    )
    departments |= {
        d
        for r, d in user.role_assignments.values_list("role", "department_id")
        if r in DEPARTMENT_SCOPED_ROLES and d
    }
    offerings |= set(
        OfferingInstructor.objects.filter(user=user).values_list("offering_id", flat=True)
    )

    audiences = {A.Audience.PUBLIC, A.Audience.ALL_INTERNAL}
    if is_student:
        audiences.add(A.Audience.STUDENTS)
    if staff_roles:
        audiences.add(A.Audience.STAFF)
    in_scope = (
        Q(scope=A.Scope.COLLEGE)
        | Q(scope=A.Scope.DEPARTMENT, scope_id__in=departments)
        | Q(scope=A.Scope.PROGRAM, scope_id__in=programs)
        | Q(scope=A.Scope.OFFERING, scope_id__in=offerings)
    )
    return live_q() & Q(audience__in=audiences) & in_scope


def public_q() -> Q:
    return live_q() & Q(audience=A.Audience.PUBLIC, scope=A.Scope.COLLEGE)


def department_public_q_any(department_ids) -> Q:
    """Departments' public news, shown on their pages of the public site."""
    return live_q() & Q(
        audience=A.Audience.PUBLIC, scope=A.Scope.DEPARTMENT, scope_id__in=department_ids
    )


def request_site_rebuild() -> None:
    """Debounced (2 minutes) call to the static site's deploy hook (docs/05 §8.7).
    Without SITE_REBUILD_HOOK_URL (the static host's deploy hook) this does nothing."""
    url = getattr(settings, "SITE_REBUILD_HOOK_URL", "")
    if not url or not cache.add("site-rebuild-pending", True, timeout=120):
        return
    from .tasks import trigger_site_rebuild

    trigger_site_rebuild.apply_async(countdown=120)


def call_rebuild_hook() -> bool:
    url = getattr(settings, "SITE_REBUILD_HOOK_URL", "")
    cache.delete("site-rebuild-pending")
    if not url.startswith("https://"):
        return False
    try:
        request = urllib.request.Request(  # noqa: S310  (https only, checked above)
            url, data=b"{}", method="POST", headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(request, timeout=15):  # noqa: S310  (https only)
            return True
    except OSError:
        log.warning("site rebuild hook failed")
        return False
