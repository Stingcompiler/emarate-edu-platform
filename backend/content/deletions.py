"""Deleting announcements and sent notifications (owner, 2026-11-05).

What a person published stays in their history; deleting it is a request that the system admin
or the system supervisor approves. The system admin deletes at once, and so does the site
manager for what they may delete; the system supervisor approves but never deletes on their own.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.exceptions import PermissionDenied

from accounts import rbac
from accounts.rbac import Role
from audit.services import RequestMeta, record, snapshot
from core.errors import Conflict

from .models import Announcement, DeletionRequest, Status

K = DeletionRequest.Kind


def deletes_at_once(user, kind: str) -> bool:
    """The system admin, and the site manager for announcements they may delete."""
    if rbac.is_admin(user, deleting=True):
        return True
    return kind == K.ANNOUNCEMENT and rbac.has_role(user, Role.SITE_MANAGER)


def pending(kind: str, object_ids) -> set[int]:
    return set(
        DeletionRequest.objects.filter(
            kind=kind, object_id__in=list(object_ids), state=DeletionRequest.State.PENDING
        ).values_list("object_id", flat=True)
    )


def request(meta: RequestMeta, kind: str, obj, reason: str = "") -> DeletionRequest:
    from notifications.models import Category
    from notifications.services import notify

    with transaction.atomic():
        if DeletionRequest.objects.filter(
            kind=kind, object_id=obj.pk, state=DeletionRequest.State.PENDING
        ).exists():
            raise Conflict(gettext("A deletion request is already waiting."), code="pending")
        req = DeletionRequest.objects.create(
            kind=kind,
            object_id=obj.pk,
            title=str(obj.title)[:200],
            reason=(reason or "").strip()[:2000],
            requested_by=meta.actor,
        )
        record(meta, "deletion.request", req, new={"kind": kind, "title": req.title})
    approvers = list(
        rbac_users_with(Role.SYSTEM_ADMIN, Role.SYSTEM_SUPERVISOR).exclude(pk=meta.actor.pk)
    )
    if approvers:
        notify(
            approvers,
            category=Category.COLLEGE,
            title=f"طلب حذف {req.get_kind_display()}: {req.title}",
            body=f"من {meta.actor.full_name_ar}" + (f" — {req.reason}" if req.reason else ""),
            action_url="/system/deletions",
        )
    return req


def rbac_users_with(*roles):
    from accounts.models import User

    return User.objects.filter(is_active=True, role_assignments__role__in=roles).distinct()


def delete_now(meta: RequestMeta, kind: str, obj) -> None:
    """The deletion itself, audited (and the site rebuilt for a public announcement)."""
    if kind == K.ANNOUNCEMENT:
        from . import services
        from .views import _department

        was_public = obj.audience == Announcement.Audience.PUBLIC and obj.status == Status.PUBLISHED
        record(meta, "announcement.delete", obj, old=snapshot(obj), department_id=_department(obj))
        obj.delete()
        if was_public:
            transaction.on_commit(services.request_site_rebuild)
    else:
        record(meta, "notification.delete", obj, old={"title": obj.title, "body": obj.body})
        obj.delete()  # its recipients' copies go with it (CASCADE)


def _target(req: DeletionRequest):
    from notifications.models import Notification

    model = Announcement if req.kind == K.ANNOUNCEMENT else Notification
    return model.objects.filter(pk=req.object_id).first()


def decide(meta: RequestMeta, req: DeletionRequest, *, approve: bool, note: str = "") -> None:
    from notifications.models import Category
    from notifications.services import notify

    if not rbac.can(meta.actor, "deletions.approve"):
        raise PermissionDenied()
    if req.kind in RECORD_KINDS:
        # Students and courses: the system admin alone decides; approving is the deletion
        # itself (core.deletion_views), with its preview, confirmation and password.
        if not rbac.can(meta.actor, "deletions.approve_records"):
            raise PermissionDenied()
        if approve:
            raise Conflict(
                gettext("Approve it from the deletion form, which shows what goes with it."),
                code="use_deletion",
            )
    with transaction.atomic():
        req = DeletionRequest.objects.select_for_update().get(pk=req.pk)
        if req.state != DeletionRequest.State.PENDING:
            raise Conflict(gettext("This request was already decided."), code="decided")
        if req.requested_by_id == meta.actor.pk:
            # No one decides their own request: the supervisor would delete by approving
            # itself (roles review 2026-11-06, owner's decision).
            raise PermissionDenied(gettext("Someone else decides on your own request."))
        if approve:
            target = _target(req)
            if target is not None:
                delete_now(meta, req.kind, target)
        req.state = DeletionRequest.State.APPROVED if approve else DeletionRequest.State.REJECTED
        req.decided_by = meta.actor
        req.decided_at = timezone.now()
        req.decision_note = (note or "").strip()[:2000]
        req.save(update_fields=["state", "decided_by", "decided_at", "decision_note"])
        record(
            meta,
            "deletion.approve" if approve else "deletion.reject",
            req,
            new={"kind": req.kind, "title": req.title, "note": req.decision_note},
        )
    notify(
        [req.requested_by],
        category=Category.COLLEGE,
        title=(
            f"حُذف {req.get_kind_display()} «{req.title}»"
            if approve
            else f"لم يُوافَق على حذف {req.get_kind_display()} «{req.title}»"
        ),
        body=req.decision_note,
        action_url=(
            "/announcements"
            if req.kind == K.ANNOUNCEMENT
            else "/deletion-requests"
            if req.kind in RECORD_KINDS
            else "/notifications?tab=sent"
        ),
    )


# ─── Students and courses (owner, 2026-11-15) ────────────────────────────────────────────
#
# A department's or a programme's head asks to delete students or a course of theirs, with
# everything they hold; the system admin alone decides — approving through the same deletion as
# their own (core.deletion_views, with the request's number), so the approval is the deletion and
# the request is marked approved only once the rows are gone.

RECORD_KINDS = {K.STUDENT, K.COURSE, K.PROGRAM}
_CAPABILITY = {
    K.STUDENT: "students.delete",
    K.COURSE: "courses.delete",
    K.PROGRAM: "programs.delete",
}


def _program_of(kind: str, row) -> int | None:
    return row.pk if kind == K.PROGRAM else row.program_id


def _pending_targets(kind: str) -> set[str]:
    found: set[str] = set()
    for targets in DeletionRequest.objects.filter(
        kind=kind, state=DeletionRequest.State.PENDING
    ).values_list("targets", flat=True):
        found.update(str(t) for t in targets)
    return found


def request_records(meta: RequestMeta, kind: str, rows: list, reason: str = "") -> DeletionRequest:
    """Ask the system admin to delete ``rows`` (students, or one course) with everything they
    hold. Each must be within the asker's scope; none may already wait in another request."""
    from core import deletions
    from notifications.models import Category
    from notifications.services import notify

    if kind not in RECORD_KINDS or not rows:
        raise PermissionDenied()
    scope = rbac.scope_for(meta.actor, _CAPABILITY[kind])
    if scope.none or not all(scope.allows(r.department_id, _program_of(kind, r)) for r in rows):
        raise PermissionDenied(gettext("Some of them are outside your department or programme."))
    ids = [str(r.public_id) if kind == K.STUDENT else str(r.pk) for r in rows]
    with transaction.atomic():
        if set(ids) & _pending_targets(kind):
            raise Conflict(gettext("A deletion request is already waiting."), code="pending")
        first = rows[0]
        name = (
            f"{first.full_name_ar} ({first.university_number})"
            if kind == K.STUDENT
            else f"{first.code} · {first.name_ar}"
        )
        title = name if len(rows) == 1 else f"{name} و{len(rows) - 1} غيره"
        programs = {_program_of(kind, r) for r in rows}
        departments = {r.department_id for r in rows}
        req = DeletionRequest.objects.create(
            kind=kind,
            object_id=first.pk,
            title=title[:200],
            reason=(reason or "").strip()[:2000],
            requested_by=meta.actor,
            targets=ids,
            department_id=departments.pop() if len(departments) == 1 else None,
            program_id=programs.pop() if len(programs) == 1 else None,
            preview=deletions.preview(kind, rows),
        )
        record(
            meta,
            "deletion.request",
            req,
            new={"kind": kind, "title": req.title, "count": len(ids)},
            department_id=req.department_id,
            program_id=req.program_id,
        )
    admins = list(rbac_users_with(Role.SYSTEM_ADMIN).exclude(pk=meta.actor.pk))
    if admins:
        notify(
            admins,
            category=Category.COLLEGE,
            title=f"طلب حذف {req.get_kind_display()}: {req.title}",
            body=f"من {meta.actor.full_name_ar}" + (f" — {req.reason}" if req.reason else ""),
            action_url="/system/deletions",
        )
    return req


def pending_record_request(request_id: int, kind: str, ids: list[str]) -> DeletionRequest:
    """The waiting request an approval names, locked; its targets must be exactly ``ids``."""
    req = DeletionRequest.objects.select_for_update().filter(pk=request_id).first()
    if req is None or req.kind != kind:
        raise Conflict(gettext("This request was already decided."), code="decided")
    if req.state != DeletionRequest.State.PENDING:
        raise Conflict(gettext("This request was already decided."), code="decided")
    if sorted(map(str, req.targets)) != sorted(map(str, ids)):
        raise Conflict(gettext("The request asks for other records."), code="targets")
    return req


def approved(meta: RequestMeta, req: DeletionRequest) -> None:
    """After the deletion went through: the request is approved, on the record, and its asker
    told."""
    from notifications.models import Category
    from notifications.services import notify

    req.state = DeletionRequest.State.APPROVED
    req.decided_by = meta.actor
    req.decided_at = timezone.now()
    req.save(update_fields=["state", "decided_by", "decided_at"])
    record(meta, "deletion.approve", req, new={"kind": req.kind, "title": req.title})
    transaction.on_commit(
        lambda: notify(
            [req.requested_by],
            category=Category.COLLEGE,
            title=f"حُذف {req.get_kind_display()}: {req.title}",
            body="وافق مدير النظام على طلبك، وحُذف مع كل ما يرتبط به.",
            action_url="/deletion-requests",
        )
    )
