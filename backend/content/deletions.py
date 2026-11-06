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
        action_url="/announcements" if req.kind == K.ANNOUNCEMENT else "/notifications?tab=sent",
    )
