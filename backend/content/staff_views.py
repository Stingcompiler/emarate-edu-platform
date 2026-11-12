"""«الكوادر» on the site, grouped (owner, 2026-11-09): the site team's matrix and the public list.
The rules live in content/staff.py."""

from __future__ import annotations

from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers as S
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from audit.services import RequestMeta
from core.permissions import capability

from . import staff
from .models import StaffEntry, StaffGroup, StaffPlacement
from .placeholder import MARK
from .views import PUBLIC_CACHE, _PublicRead

CAPABILITY = "site_staff.manage"


def _meta(request):
    return RequestMeta.from_request(request)


# --- Serializers ---------------------------------------------------------------------------


class StaffGroupSerializer(S.ModelSerializer):
    class Meta:
        model = StaffGroup
        fields = ["id", "name_ar", "name_en", "order", "is_visible", "holds_faculty"]
        # Taking «holds the faculty» moves it from the other group (content/staff.py), so the
        # one-group constraint is not a validation error here.
        extra_kwargs = {"name_ar": {"required": True}, "holds_faculty": {"validators": []}}


class PlacementSerializer(S.Serializer):
    group = S.IntegerField()
    position_ar = S.CharField(max_length=120, required=False, allow_blank=True, default="")
    position_en = S.CharField(max_length=120, required=False, allow_blank=True, default="")
    order = S.IntegerField(min_value=0, max_value=999, required=False, default=0)


class StaffRowSerializer(S.Serializer):
    """One person on the matrix: an entry, or a teacher placed by themselves (``automatic``)."""

    entry = S.CharField(allow_null=True)
    user = S.CharField(allow_null=True)
    name_ar = S.CharField()
    name_en = S.CharField()
    title_ar = S.CharField()
    title_en = S.CharField()
    photo = S.CharField(allow_null=True)
    # Has an account; the account agreed to appear (always true for a person with no account).
    account = S.BooleanField()
    consent = S.BooleanField()
    # Still a staff account (false once its staff roles are gone: it no longer shows).
    staff = S.BooleanField()
    teaching = S.BooleanField()
    automatic = S.BooleanField()
    # The title says it is an example («(مثال)»): the site hides the person (lib/sample.mjs).
    sample = S.BooleanField()
    placements = PlacementSerializer(many=True)


class StaffBoardSerializer(S.Serializer):
    groups = StaffGroupSerializer(many=True)
    rows = StaffRowSerializer(many=True)


class StaffEntryWriteSerializer(S.Serializer):
    user = S.UUIDField(required=False, allow_null=True)
    name_ar = S.CharField(max_length=200, required=False, allow_blank=True)
    name_en = S.CharField(max_length=200, required=False, allow_blank=True)
    title_ar = S.CharField(max_length=100, required=False, allow_blank=True)
    title_en = S.CharField(max_length=100, required=False, allow_blank=True)
    photo = S.UUIDField(required=False, allow_null=True)
    placements = PlacementSerializer(many=True, required=False)


class StaffPersonSerializer(S.Serializer):
    public_id = S.CharField()
    full_name_ar = S.CharField()
    academic_title_ar = S.CharField()
    public_profile = S.BooleanField()
    on_page = S.BooleanField()


class PublicStaffMemberSerializer(S.Serializer):
    # The account's public id: its page /staff/<id>/ exists when it teaches; null for a person
    # with no account.
    id = S.CharField(allow_null=True)
    name_ar = S.CharField()
    name_en = S.CharField()
    title_ar = S.CharField()
    title_en = S.CharField()
    position_ar = S.CharField()
    position_en = S.CharField()
    photo = S.CharField(allow_null=True)


class PublicStaffGroupSerializer(S.Serializer):
    id = S.IntegerField()
    name_ar = S.CharField()
    name_en = S.CharField()
    members = PublicStaffMemberSerializer(many=True)


# --- Shaping -------------------------------------------------------------------------------


def _account_photo(user: User, request) -> str | None:
    if not (user.public_photo and not user.public_photo_hidden and user.photo_id):
        return None
    url = f"/api/public/staff-photos/{user.public_id}.webp"
    return request.build_absolute_uri(url) if request is not None else url


def _person(entry: StaffEntry | None, user: User | None, request) -> dict:
    if user is not None:
        return {
            "user": str(user.public_id),
            "name_ar": user.full_name_ar,
            "name_en": user.full_name_en,
            "title_ar": user.academic_title_ar,
            "title_en": user.academic_title_en,
            "photo": _account_photo(user, request),
        }
    return {
        "user": None,
        "name_ar": entry.name_ar,
        "name_en": entry.name_en,
        "title_ar": entry.title_ar,
        "title_en": entry.title_en,
        "photo": entry.photo.file.url if entry.photo_id else None,
    }


def _sample(person: dict) -> bool:
    """The site drops a person whose title carries the demo's mark (apps/landing/src/lib/
    sample.mjs, «IDENTITY»); the board says so instead of leaving them silently missing."""
    return any(MARK.search(person[k] or "") for k in ("title_ar", "title_en"))


def _placement(p: StaffPlacement) -> dict:
    return {
        "group": p.group_id,
        "position_ar": p.position_ar,
        "position_en": p.position_en,
        "order": p.order,
    }


def _entries():
    return StaffEntry.objects.select_related("user", "photo").prefetch_related(
        Prefetch("placements", queryset=StaffPlacement.objects.order_by("order", "id"))
    )


def _row(entry: StaffEntry, request, *, teaching: bool, on_staff: bool) -> dict:
    user = entry.user
    person = _person(entry, user, request)
    return {
        "entry": str(entry.public_id),
        **person,
        "sample": _sample(person),
        "account": user is not None,
        # Shows on the site: an account while it is active, staff, and agrees to appear.
        "consent": user is None or (user.is_active and user.public_profile),
        "staff": user is None or on_staff,
        "teaching": teaching,
        "automatic": False,
        "placements": [_placement(p) for p in entry.placements.all()],
    }


def entry_row(entry: StaffEntry, request) -> dict:
    """One person's row, for the answer to a write (not the whole board)."""
    entry = _entries().get(pk=entry.pk)
    account = User.objects.filter(pk=entry.user_id)
    return _row(
        entry,
        request,
        teaching=account.filter(staff.teaching_q()).exists(),
        on_staff=staff.staff_accounts().filter(pk=entry.user_id).exists(),
    )


def board(request) -> dict:
    teaching = set(User.objects.filter(staff.teaching_q()).values_list("pk", flat=True))
    on_staff = set(staff.staff_accounts().values_list("pk", flat=True))
    faculty = StaffGroup.objects.filter(holds_faculty=True).first()
    rows = []
    for entry in _entries():
        rows.append(
            _row(
                entry,
                request,
                teaching=entry.user_id in teaching,
                on_staff=entry.user_id in on_staff,
            )
        )
    for user in staff.automatic_faculty():
        person = _person(None, user, request)
        rows.append(
            {
                "entry": None,
                **person,
                "sample": _sample(person),
                "account": True,
                "consent": True,
                "staff": True,
                "teaching": True,
                "automatic": True,
                "placements": (
                    [{"group": faculty.pk, "position_ar": "", "position_en": "", "order": 0}]
                    if faculty
                    else []
                ),
            }
        )
    rows.sort(key=lambda r: r["name_ar"])
    return {"groups": list(StaffGroup.objects.all()), "rows": rows}


def public_groups(request) -> list[dict]:
    """Visible groups in order, each with its members: placed by hand first (by the order the
    site team gave, then name), then — in the faculty group — teaching staff placed by
    themselves. An account appears only while active, staff, and with its own consent."""
    placements = (
        StaffPlacement.objects.filter(
            Q(entry__user__isnull=True) | staff.shown("entry__user"), group__is_visible=True
        )
        .select_related("entry__user", "entry__photo")
        .order_by("order", "id")
    )
    by_group: dict[int, list[tuple]] = {}
    for p in placements:
        person = _person(p.entry, p.entry.user, request)
        member = {
            "id": person.pop("user"),
            **person,
            "position_ar": p.position_ar,
            "position_en": p.position_en,
        }
        by_group.setdefault(p.group_id, []).append((p.order, member["name_ar"], member))
    groups = []
    for group in StaffGroup.objects.filter(is_visible=True):
        members = [m for *_, m in sorted(by_group.get(group.pk, []), key=lambda t: t[:2])]
        if group.holds_faculty:
            for user in staff.automatic_faculty().order_by("full_name_ar"):
                person = _person(None, user, request)
                members.append(
                    {"id": person.pop("user"), **person, "position_ar": "", "position_en": ""}
                )
        if members:
            groups.append(
                {
                    "id": group.pk,
                    "name_ar": group.name_ar,
                    "name_en": group.name_en,
                    "members": members,
                }
            )
    return groups


# --- Views ---------------------------------------------------------------------------------


class _Manage(APIView):
    def get_permissions(self):
        return [IsAuthenticated(), capability(CAPABILITY)()]


@extend_schema(tags=["content"])
class StaffBoardView(_Manage):
    """The matrix: every group and every person on the page."""

    @extend_schema(operation_id="site_staff_board", responses=StaffBoardSerializer)
    def get(self, request):
        return Response(StaffBoardSerializer(board(request)).data)


@extend_schema(tags=["content"])
class StaffPeopleView(_Manage):
    """Staff accounts to add, by name (students never)."""

    @extend_schema(
        operation_id="site_staff_people",
        parameters=[OpenApiParameter("search", str)],
        responses=StaffPersonSerializer(many=True),
    )
    def get(self, request):
        # By name, from two letters: the site team adds staff, it does not browse or look up
        # accounts by email (users.view is not theirs; review 2026-11-09).
        search = (request.query_params.get("search") or "").strip()
        if len(search) < 2:
            return Response([])
        people = (
            staff.staff_accounts()
            .filter(Q(full_name_ar__icontains=search) | Q(full_name_en__icontains=search))
            .order_by("full_name_ar")
        )
        on_page = set(StaffEntry.objects.values_list("user_id", flat=True))
        rows = [
            {
                "public_id": str(u.public_id),
                "full_name_ar": u.full_name_ar,
                "academic_title_ar": u.academic_title_ar,
                "public_profile": u.public_profile,
                "on_page": u.pk in on_page,
            }
            for u in people[:20]
        ]
        return Response(StaffPersonSerializer(rows, many=True).data)


@extend_schema(tags=["content"])
class StaffGroupsView(_Manage):
    @extend_schema(operation_id="site_staff_groups_list", responses=StaffGroupSerializer(many=True))
    def get(self, request):
        return Response(StaffGroupSerializer(StaffGroup.objects.all(), many=True).data)

    @extend_schema(
        operation_id="site_staff_groups_create",
        request=StaffGroupSerializer,
        responses={201: StaffGroupSerializer},
    )
    def post(self, request):
        data = StaffGroupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        group = staff.create_group(_meta(request), **data.validated_data)
        return Response(StaffGroupSerializer(group).data, status=status.HTTP_201_CREATED)


class StaffGroupOrderSerializer(S.Serializer):
    ids = S.ListField(child=S.IntegerField(), allow_empty=False)


@extend_schema(tags=["content"])
class StaffGroupOrderView(_Manage):
    """The groups in a new order, in one write."""

    @extend_schema(
        operation_id="site_staff_groups_order",
        request=StaffGroupOrderSerializer,
        responses=StaffGroupSerializer(many=True),
    )
    def put(self, request):
        data = StaffGroupOrderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        groups = staff.reorder_groups(_meta(request), data.validated_data["ids"])
        return Response(StaffGroupSerializer(groups, many=True).data)


@extend_schema(tags=["content"])
class StaffGroupView(_Manage):
    @extend_schema(
        operation_id="site_staff_groups_update",
        request=StaffGroupSerializer,
        responses=StaffGroupSerializer,
    )
    def patch(self, request, pk):
        group = get_object_or_404(StaffGroup, pk=pk)
        data = StaffGroupSerializer(group, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        group = staff.update_group(_meta(request), group, **data.validated_data)
        return Response(StaffGroupSerializer(group).data)

    @extend_schema(operation_id="site_staff_groups_delete", responses={204: None})
    def delete(self, request, pk):
        staff.delete_group(_meta(request), get_object_or_404(StaffGroup, pk=pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


def _entry_fields(data: dict) -> dict:
    fields = dict(data)
    if fields.get("photo") is not None:
        fields["photo"] = str(fields["photo"])
    if "placements" in fields:
        fields["placements"] = [dict(p) for p in fields["placements"]]
    return fields


@extend_schema(tags=["content"])
class StaffEntriesView(_Manage):
    @extend_schema(
        operation_id="site_staff_entries_create",
        request=StaffEntryWriteSerializer,
        responses={201: StaffRowSerializer},
    )
    def post(self, request):
        data = StaffEntryWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = _entry_fields(data.validated_data)
        user_id = fields.pop("user", None)
        user = get_object_or_404(User, public_id=user_id) if user_id else None
        entry = staff.create_entry(_meta(request), user=user, **fields)
        return Response(
            StaffRowSerializer(entry_row(entry, request)).data, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["content"])
class StaffEntryView(_Manage):
    @extend_schema(
        operation_id="site_staff_entries_update",
        request=StaffEntryWriteSerializer,
        responses=StaffRowSerializer,
    )
    def patch(self, request, public_id):
        entry = get_object_or_404(StaffEntry, public_id=public_id)
        data = StaffEntryWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        fields = _entry_fields(data.validated_data)
        fields.pop("user", None)  # an entry's account never changes
        staff.update_entry(_meta(request), entry, **fields)
        return Response(StaffRowSerializer(entry_row(entry, request)).data)

    @extend_schema(operation_id="site_staff_entries_delete", responses={204: None})
    def delete(self, request, public_id):
        staff.delete_entry(_meta(request), get_object_or_404(StaffEntry, public_id=public_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicStaffView(_PublicRead):
    @extend_schema(
        operation_id="public_staff_groups", responses=PublicStaffGroupSerializer(many=True)
    )
    def get(self, request):
        return Response(PublicStaffGroupSerializer(public_groups(request), many=True).data)
