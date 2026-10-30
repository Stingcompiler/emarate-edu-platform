"""A staff member's public profile beyond name and title (owner, 2026-10-30): their degrees and
whether their photo may appear on the site; academic affairs may hide either. Every write is
audited."""

from __future__ import annotations

from django.db import transaction
from django.utils.translation import gettext
from rest_framework.exceptions import NotFound, PermissionDenied

from audit.services import RequestMeta, record

from . import rbac
from .models import Qualification, User
from .rbac import Role

# Who appears on a department's public page (same as MyPublicProfileView).
MEMBERS = frozenset({Role.TEACHER, Role.TA, Role.DEPARTMENT_MANAGER})
FIELDS = ["degree", "field", "institution", "year"]


def site_changed() -> None:
    """What the site's «الكوادر» shows changed: rebuild it (debounced, after the commit)."""
    from content.services import request_site_rebuild

    transaction.on_commit(request_site_rebuild)


def _member(user: User) -> None:
    if not rbac.roles_of(user) & MEMBERS:
        raise PermissionDenied(gettext("Only teaching staff appear on the public pages."))


def _snapshot(q: Qualification) -> dict:
    return {f: getattr(q, f) for f in FIELDS}


def add(meta: RequestMeta, user: User, **data) -> Qualification:
    _member(user)
    with transaction.atomic():
        q = Qualification.objects.create(user=user, **{f: data.get(f) for f in FIELDS})
        record(meta, "profile.qualification_add", q, new=_snapshot(q))
        site_changed()
    return q


def _own(user: User, pk: int) -> Qualification:
    q = Qualification.objects.select_for_update().filter(pk=pk, user=user).first()
    if q is None:
        raise NotFound()
    return q


def change(meta: RequestMeta, user: User, pk: int, **data) -> Qualification:
    _member(user)
    with transaction.atomic():
        q = _own(user, pk)
        old = _snapshot(q)
        for f in FIELDS:
            if f in data:
                setattr(q, f, data[f])
        q.save()
        record(meta, "profile.qualification_change", q, old=old, new=_snapshot(q))
        site_changed()
    return q


def remove(meta: RequestMeta, user: User, pk: int) -> None:
    with transaction.atomic():
        q = _own(user, pk)
        record(meta, "profile.qualification_remove", q, old=_snapshot(q))
        q.delete()
        site_changed()


def _moderator(user: User) -> None:
    if not rbac.can(user, "staff_profiles.moderate"):
        raise PermissionDenied()


def hide_photo(meta: RequestMeta, actor: User, member: User, hidden: bool) -> User:
    _moderator(actor)
    with transaction.atomic():
        old = member.public_photo_hidden
        member.public_photo_hidden = hidden
        member.save(update_fields=["public_photo_hidden"])
        record(meta, "profile.photo_moderate", member, old={"hidden": old}, new={"hidden": hidden})
        site_changed()
    return member


def hide_qualification(meta: RequestMeta, actor: User, pk: int, hidden: bool) -> Qualification:
    _moderator(actor)
    with transaction.atomic():
        q = Qualification.objects.select_for_update().filter(pk=pk).first()
        if q is None:
            raise NotFound()
        old = q.hidden
        q.hidden = hidden
        q.save(update_fields=["hidden"])
        record(
            meta, "profile.qualification_moderate", q, old={"hidden": old}, new={"hidden": hidden}
        )
        site_changed()
    return q


def ranked(qualifications) -> list[Qualification]:
    """Highest degree first, then the most recent year."""
    return sorted(
        qualifications, key=lambda q: (Qualification.RANK.get(q.degree, 9), -(q.year or 0))
    )
