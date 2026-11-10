"""«الكوادر» on the site, grouped (owner, 2026-11-09): the site team adds people to the page —
staff accounts, or people with no account (a dean, a trustee) — and sorts them into groups
(«هيئة الإدارة», «هيئة التدريس», any they add) on a matrix. Adding someone here never makes an
account. An account still appears only with its own consent (``public_profile``); teaching staff
who consented and were not placed by hand show in the group that holds the faculty. Every write
is audited and rebuilds the site."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils.translation import gettext
from rest_framework.exceptions import ValidationError

from accounts.models import RoleAssignment, User
from accounts.rbac import Role
from audit.services import RequestMeta, record
from core.errors import Conflict

from .models import MediaAsset, StaffEntry, StaffGroup, StaffPlacement
from .services import request_site_rebuild

GROUP_FIELDS = ["name_ar", "name_en", "order", "is_visible", "holds_faculty"]
ENTRY_FIELDS = ["name_ar", "name_en", "title_ar", "title_en"]


def teaching_q() -> Q:
    """A department head or a member of a department: who the faculty group holds by itself."""
    from academic.models import DepartmentMembership

    return Q(
        Exists(RoleAssignment.objects.filter(user=OuterRef("pk"), role=Role.DEPARTMENT_MANAGER))
    ) | Q(Exists(DepartmentMembership.objects.filter(user=OuterRef("pk"))))


def consenting():
    return User.objects.filter(is_active=True, public_profile=True)


def automatic_faculty():
    """Teaching staff who chose to appear and whom nobody placed by hand."""
    return consenting().filter(teaching_q(), site_staff__isnull=True)


def staff_q() -> Q:
    """A staff account: it holds a role other than student, as accounts.staff_profile.on_staff.
    A teaching assistant who also studies (a master's student who assists) is staff (owner's
    plan 2026-11-10, K1); their name still comes from the student record."""
    return Q(Exists(RoleAssignment.objects.filter(user=OuterRef("pk")).exclude(role=Role.STUDENT)))


def staff_accounts():
    """Accounts that may be added to the page: staff, not students."""
    return User.objects.filter(staff_q(), is_active=True)


def shown(user_ref: str) -> Exists:
    """An account on the page shows while it is active, a staff account, and agrees to appear:
    one that left the staff drops off by itself, like a teacher whose membership ends.
    ``user_ref`` names the account's id in the outer query (``"entry__user"``, ``"pk"``)."""
    return Exists(
        User.objects.filter(staff_q(), pk=OuterRef(user_ref), is_active=True, public_profile=True)
    )


def _changed() -> None:
    transaction.on_commit(request_site_rebuild)


def _group_snapshot(group: StaffGroup) -> dict:
    return {f: getattr(group, f) for f in GROUP_FIELDS}


def _faculty_flag(group: StaffGroup, holds: bool) -> None:
    """One group holds the faculty: taking the flag moves it from the other."""
    if holds:
        StaffGroup.objects.exclude(pk=group.pk).filter(holds_faculty=True).update(
            holds_faculty=False
        )


def create_group(meta: RequestMeta, **data) -> StaffGroup:
    with transaction.atomic():
        if "order" not in data:
            last = StaffGroup.objects.order_by("-order").values_list("order", flat=True).first()
            data["order"] = (last or 0) + 1
        group = StaffGroup(**{f: data[f] for f in GROUP_FIELDS if f in data})
        _faculty_flag(group, group.holds_faculty)
        group.save()
        record(meta, "site.staff_group_create", group, new=_group_snapshot(group))
        _changed()
    return group


def update_group(meta: RequestMeta, group: StaffGroup, **data) -> StaffGroup:
    with transaction.atomic():
        group = StaffGroup.objects.select_for_update().get(pk=group.pk)
        old = _group_snapshot(group)
        if group.holds_faculty and data.get("holds_faculty") is False:
            raise Conflict(
                gettext("Choose another group to hold the teaching staff first."),
                code="holds_faculty",
            )
        for f in GROUP_FIELDS:
            if f in data:
                setattr(group, f, data[f])
        _faculty_flag(group, group.holds_faculty)
        group.save()
        record(meta, "site.staff_group_update", group, old=old, new=_group_snapshot(group))
        _changed()
    return group


def reorder_groups(meta: RequestMeta, ids: list[int]) -> list[StaffGroup]:
    """The groups in the order given, numbered 1..n: one write and one audit entry for a move
    (review 2026-11-10, K7). ``ids`` must name every group exactly once."""
    with transaction.atomic():
        groups = {g.pk: g for g in StaffGroup.objects.select_for_update()}
        if len(ids) != len(groups) or set(ids) != set(groups):
            raise ValidationError({"ids": [gettext("Send every group once, in the new order.")]})
        old = [g.pk for g in sorted(groups.values(), key=lambda g: (g.order, g.pk))]
        for position, pk in enumerate(ids, start=1):
            if groups[pk].order != position:
                groups[pk].order = position
                groups[pk].save(update_fields=["order", "updated_at"])
        first = groups[ids[0]]
        record(meta, "site.staff_group_reorder", first, old={"order": old}, new={"order": ids})
        _changed()
    return [groups[pk] for pk in ids]


def delete_group(meta: RequestMeta, group: StaffGroup) -> None:
    with transaction.atomic():
        group = StaffGroup.objects.select_for_update().get(pk=group.pk)
        if group.holds_faculty:
            raise Conflict(
                gettext(
                    "This group holds the teaching staff. Choose another group for them first."
                ),
                code="holds_faculty",
            )
        record(meta, "site.staff_group_delete", group, old=_group_snapshot(group))
        group.delete()  # its placements go with it; the people stay on the matrix
        _changed()


def _entry_snapshot(entry: StaffEntry) -> dict:
    return {
        "user": str(entry.user.public_id) if entry.user_id else None,
        **{f: getattr(entry, f) for f in ENTRY_FIELDS},
        "photo": entry.photo_id,
        "placements": [
            {"group": p.group_id, "position_ar": p.position_ar, "order": p.order}
            for p in entry.placements.all()
        ],
    }


def _photo(value) -> MediaAsset | None:
    if value in (None, ""):
        return None
    asset = MediaAsset.objects.filter(public_id=value).first()
    if asset is None:
        raise ValidationError({"photo": [gettext("Pick a picture from the media library.")]})
    return asset


def _set_placements(entry: StaffEntry, placements: list[dict]) -> None:
    groups = {g.pk: g for g in StaffGroup.objects.filter(pk__in=[p["group"] for p in placements])}
    seen = set()
    rows = []
    for p in placements:
        group = groups.get(p["group"])
        if group is None:
            raise ValidationError({"placements": [gettext("Unknown group.")]})
        if group.pk in seen:
            continue
        seen.add(group.pk)
        rows.append(
            StaffPlacement(
                entry=entry,
                group=group,
                position_ar=p.get("position_ar", ""),
                position_en=p.get("position_en", ""),
                order=p.get("order", 0),
            )
        )
    entry.placements.all().delete()
    StaffPlacement.objects.bulk_create(rows)


def create_entry(
    meta: RequestMeta, *, user: User | None = None, placements: list[dict] | None = None, **data
) -> StaffEntry:
    """A staff account (its name, title and photo come from the account) or a person with no
    account (the site team enters them). Without ``placements``, an account that teaches keeps
    its place in the faculty group, as before it was added."""
    with transaction.atomic():
        if user is not None:
            if not staff_accounts().filter(pk=user.pk).exists():
                raise ValidationError({"user": [gettext("Only staff accounts can be added.")]})
            if StaffEntry.objects.filter(user=user).exists():
                raise Conflict(gettext("This person is already on the page."), code="exists")
            if placements is None:
                faculty = StaffGroup.objects.filter(holds_faculty=True).first()
                teaches = User.objects.filter(teaching_q(), pk=user.pk).exists()
                placements = [{"group": faculty.pk}] if faculty and teaches else []
            entry = StaffEntry.objects.create(user=user, created_by=meta.actor)
        else:
            if not (data.get("name_ar") or "").strip():
                raise ValidationError({"name_ar": [gettext("Enter the name.")]})
            entry = StaffEntry.objects.create(
                **{f: (data.get(f) or "").strip() for f in ENTRY_FIELDS},
                photo=_photo(data.get("photo")),
                created_by=meta.actor,
            )
        _set_placements(entry, placements or [])
        record(meta, "site.staff_add", entry, new=_entry_snapshot(entry))
        _changed()
    return entry


def update_entry(meta: RequestMeta, entry: StaffEntry, **data) -> StaffEntry:
    """A person with no account: name, title and photo. An account's come from the account."""
    with transaction.atomic():
        entry = StaffEntry.objects.select_for_update().get(pk=entry.pk)
        old = _entry_snapshot(entry)
        if entry.user_id is None:
            for f in ENTRY_FIELDS:
                if f in data:
                    setattr(entry, f, (data[f] or "").strip())
            if not entry.name_ar:
                raise ValidationError({"name_ar": [gettext("Enter the name.")]})
            if "photo" in data:
                entry.photo = _photo(data["photo"])
            entry.save()
        if "placements" in data:
            _set_placements(entry, data["placements"])
        record(meta, "site.staff_update", entry, old=old, new=_entry_snapshot(entry))
        _changed()
    return entry


def delete_entry(meta: RequestMeta, entry: StaffEntry) -> None:
    """Off the page. An account that teaches goes back to the faculty group by itself."""
    with transaction.atomic():
        record(meta, "site.staff_remove", entry, old=_entry_snapshot(entry))
        entry.delete()
        _changed()
