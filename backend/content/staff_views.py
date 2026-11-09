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
    teaching = S.BooleanField()
    automatic = S.BooleanField()
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


def board(request) -> dict:
    teaching = set(User.objects.filter(staff.teaching_q()).values_list("pk", flat=True))
    faculty = StaffGroup.objects.filter(holds_faculty=True).first()
    rows = []
    for entry in _entries():
        user = entry.user
        rows.append(
            {
                "entry": str(entry.public_id),
                **_person(entry, user, request),
                "account": user is not None,
                "consent": user is None or (user.is_active and user.public_profile),
                "teaching": user is not None and user.pk in teaching,
                "automatic": False,
                "placements": [_placement(p) for p in entry.placements.all()],
            }
        )
    for user in staff.automatic_faculty():
        rows.append(
            {
                "entry": None,
                **_person(None, user, request),
                "account": True,
                "consent": True,
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
    themselves. An account appears only while active and with its own consent."""
    shown = Q(entry__user__isnull=True) | Q(
        entry__user__is_active=True, entry__user__public_profile=True
    )
    placements = (
        StaffPlacement.objects.filter(shown, group__is_visible=True)
        .select_related("entry__user", "entry__photo")
        .order_by("order", "id")
    )
    by_group: dict[int, list[dict]] = {}
    for p in placements:
        person = _person(p.entry, p.entry.user, request)
        by_group.setdefault(p.group_id, []).append(
            {
                "id": person.pop("user"),
                **person,
                "position_ar": p.position_ar,
                "position_en": p.position_en,
                "_order": (p.order, person["name_ar"]),
            }
        )
    groups = []
    for group in StaffGroup.objects.filter(is_visible=True):
        members = sorted(by_group.get(group.pk, []), key=lambda m: m.pop("_order"))
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
        search = (request.query_params.get("search") or "").strip()
        people = staff.staff_accounts().order_by("full_name_ar")
        if search:
            people = people.filter(
                Q(full_name_ar__icontains=search)
                | Q(full_name_en__icontains=search)
                | Q(email__icontains=search)
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
        row = next(r for r in board(request)["rows"] if r["entry"] == str(entry.public_id))
        return Response(StaffRowSerializer(row).data, status=status.HTTP_201_CREATED)


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
        row = next(r for r in board(request)["rows"] if r["entry"] == str(entry.public_id))
        return Response(StaffRowSerializer(row).data)

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
