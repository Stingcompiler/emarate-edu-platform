from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_control
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rbac
from audit.services import RequestMeta, record, snapshot
from core.permissions import capability

from . import services
from .models import (
    Announcement,
    Event,
    MediaAsset,
    Menu,
    MenuItem,
    News,
    Page,
    Redirect,
    SiteSettings,
    Status,
)
from .serializers import (
    AnnouncementSerializer,
    EventSerializer,
    MediaAssetSerializer,
    MenuItemSerializer,
    MenuSerializer,
    NewsSerializer,
    PageSerializer,
    RedirectSerializer,
    SiteSettingsSerializer,
)

PUBLIC_CACHE = method_decorator(cache_control(public=True, max_age=60), name="dispatch")


def _meta(request):
    return RequestMeta.from_request(request)


class _Managed(viewsets.ModelViewSet):
    """CRUD for site managers; every change audited, publishing asks for a site rebuild."""

    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    capability_name = "content.manage"
    author_field = "author"
    audit_name = ""

    def get_permissions(self):
        return [IsAuthenticated(), capability(self.capability_name)()]

    def perform_create(self, serializer):
        obj = serializer.save(**{self.author_field: self.request.user})
        record(_meta(self.request), f"{self.audit_name}.create", obj, new=snapshot(obj))
        self._maybe_rebuild(obj)

    def perform_update(self, serializer):
        old = snapshot(serializer.instance)
        obj = serializer.save()
        record(_meta(self.request), f"{self.audit_name}.update", obj, old=old, new=snapshot(obj))
        self._maybe_rebuild(obj)

    def perform_destroy(self, instance):
        record(_meta(self.request), f"{self.audit_name}.delete", instance, old=snapshot(instance))
        instance.delete()
        services.request_site_rebuild()

    def _maybe_rebuild(self, obj):
        if getattr(obj, "status", None) == Status.PUBLISHED or obj.__class__ is Event:
            services.request_site_rebuild()


@extend_schema(tags=["content"])
class PageViewSet(_Managed):
    serializer_class = PageSerializer
    queryset = Page.objects.all()
    audit_name = "page"
    filterset_fields = ["status"]
    search_fields = ["slug", "title_ar"]


@extend_schema(tags=["content"])
class NewsViewSet(_Managed):
    serializer_class = NewsSerializer
    queryset = News.objects.select_related("cover")
    audit_name = "news"
    filterset_fields = ["status"]
    search_fields = ["title", "slug"]


@extend_schema(tags=["content"])
class EventViewSet(_Managed):
    serializer_class = EventSerializer
    queryset = Event.objects.select_related("cover")
    capability_name = "events.manage"
    author_field = "created_by"
    audit_name = "event"
    filterset_fields = ["status"]
    search_fields = ["title", "slug"]


@extend_schema(tags=["content"])
class MediaAssetViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = MediaAssetSerializer
    queryset = MediaAsset.objects.all()
    lookup_field = "public_id"
    parser_classes = [MultiPartParser, JSONParser]

    def get_permissions(self):
        return [IsAuthenticated(), capability("events.manage")()]

    def perform_create(self, serializer):
        upload = serializer.validated_data["file"]
        asset = serializer.save(uploaded_by=self.request.user, size=upload.size)
        record(_meta(self.request), "media.upload", asset)

    def perform_destroy(self, instance):
        record(_meta(self.request), "media.delete", instance)
        instance.file.delete(save=False)
        instance.delete()


@extend_schema(tags=["content"])
class RedirectViewSet(viewsets.ModelViewSet):
    serializer_class = RedirectSerializer
    queryset = Redirect.objects.all()

    def get_permissions(self):
        return [IsAuthenticated(), capability("content.manage")()]

    def perform_create(self, serializer):
        record(_meta(self.request), "redirect.create", serializer.save())
        services.request_site_rebuild()

    def perform_update(self, serializer):
        record(_meta(self.request), "redirect.update", serializer.save())
        services.request_site_rebuild()

    def perform_destroy(self, instance):
        record(_meta(self.request), "redirect.delete", instance)
        instance.delete()


@extend_schema(tags=["content"])
class MenuView(APIView):
    permission_classes = [IsAuthenticated, capability("content.manage")]

    @extend_schema(responses=MenuSerializer)
    def get(self, request, key):
        menu, _ = Menu.objects.get_or_create(key=key)
        return Response(MenuSerializer(menu).data)

    @extend_schema(request=MenuItemSerializer(many=True), responses=MenuSerializer)
    def put(self, request, key):
        data = MenuItemSerializer(data=request.data, many=True)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            menu, _ = Menu.objects.get_or_create(key=key)
            menu.items.all().delete()
            MenuItem.objects.bulk_create(
                [
                    MenuItem(menu=menu, **{k: v for k, v in row.items() if k != "parent"})
                    for row in data.validated_data
                ]
            )
            record(_meta(request), "menu.update", menu, new={"items": len(data.validated_data)})
        services.request_site_rebuild()
        return Response(MenuSerializer(menu).data)


@extend_schema(tags=["content"])
class SiteSettingsView(APIView):
    permission_classes = [IsAuthenticated, capability("content.manage")]

    @extend_schema(responses=SiteSettingsSerializer)
    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)

    @extend_schema(request=SiteSettingsSerializer, responses=SiteSettingsSerializer)
    def patch(self, request):
        settings_ = SiteSettings.load()
        old = snapshot(settings_)
        data = SiteSettingsSerializer(settings_, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        record(_meta(request), "site.settings", settings_, old=old, new=snapshot(settings_))
        services.request_site_rebuild()
        return Response(data.data)


@extend_schema(tags=["announcements"])
class AnnouncementViewSet(viewsets.ModelViewSet):
    """Everyone reads the announcements meant for them; authors manage their own
    within the scopes docs/03 §7 allows."""

    serializer_class = AnnouncementSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["scope", "audience", "status"]
    search_fields = ["title"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Announcement.objects.none()
        user = self.request.user
        from django.db.models import Q

        mine = Q(created_by=user)
        if rbac.can(user, "content.manage"):
            mine |= Q(scope=Announcement.Scope.COLLEGE)
        return Announcement.objects.filter(services.feed_q(user) | mine).select_related(
            "cover", "created_by"
        )

    def _check(self, data):
        services.require_announce(
            self.request.user, data["scope"], data.get("scope_id"), data["audience"]
        )

    def perform_create(self, serializer):
        values = serializer.validated_data
        self._check(
            {
                "scope": values.get("scope", "college"),
                "scope_id": values.get("scope_id"),
                "audience": values["audience"],
            }
        )
        obj = serializer.save(created_by=self.request.user)
        record(_meta(self.request), "announcement.create", obj, new=snapshot(obj))

    def _owned(self, obj):
        user = self.request.user
        if obj.created_by_id != user.pk and not services.may_announce(
            user, obj.scope, obj.scope_id, obj.audience
        ):
            raise PermissionDenied()

    def perform_update(self, serializer):
        obj = serializer.instance
        self._owned(obj)
        values = serializer.validated_data
        self._check(
            {
                "scope": values.get("scope", obj.scope),
                "scope_id": values.get("scope_id", obj.scope_id),
                "audience": values.get("audience", obj.audience),
            }
        )
        old = snapshot(obj)
        obj = serializer.save()
        record(_meta(self.request), "announcement.update", obj, old=old, new=snapshot(obj))

    def perform_destroy(self, instance):
        self._owned(instance)
        record(_meta(self.request), "announcement.delete", instance, old=snapshot(instance))
        instance.delete()

    @extend_schema(request=None, responses=AnnouncementSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        obj = self.get_object()
        self._owned(obj)
        obj.status = Status.PUBLISHED
        obj.publish_at = obj.publish_at or timezone.now()
        obj.save(update_fields=["status", "publish_at", "updated_at"])
        record(_meta(request), "announcement.publish", obj)
        if obj.audience == Announcement.Audience.PUBLIC:
            services.request_site_rebuild()
        return Response(self.get_serializer(obj).data)

    @extend_schema(request=None, responses=AnnouncementSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, public_id=None):
        obj = self.get_object()
        self._owned(obj)
        obj.status = Status.ARCHIVED
        obj.save(update_fields=["status", "updated_at"])
        record(_meta(request), "announcement.archive", obj)
        return Response(self.get_serializer(obj).data)


# ─── Public (website) ─────────────────────────────────────────────────────


def _published(queryset):
    now = timezone.now()
    from django.db.models import Q

    return queryset.filter(status=Status.PUBLISHED).filter(
        Q(publish_at__isnull=True) | Q(publish_at__lte=now)
    )


class _Public(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicPageView(_Public):
    @extend_schema(responses=PageSerializer)
    def get(self, request, slug):
        return Response(PageSerializer(get_object_or_404(_published(Page.objects), slug=slug)).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicNewsList(_Public):
    @extend_schema(responses=NewsSerializer(many=True))
    def get(self, request):
        return Response(
            NewsSerializer(_published(News.objects.select_related("cover"))[:30], many=True).data
        )


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicNewsDetail(_Public):
    @extend_schema(responses=NewsSerializer)
    def get(self, request, slug):
        return Response(NewsSerializer(get_object_or_404(_published(News.objects), slug=slug)).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicEventList(_Public):
    @extend_schema(responses=EventSerializer(many=True))
    def get(self, request):
        rows = Event.objects.filter(
            status=Event.EventStatus.PUBLISHED, ends_at__gte=timezone.now()
        ).select_related("cover")
        return Response(EventSerializer(rows[:50], many=True).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicEventDetail(_Public):
    @extend_schema(responses=EventSerializer)
    def get(self, request, slug):
        event = get_object_or_404(Event.objects.exclude(status=Event.EventStatus.DRAFT), slug=slug)
        return Response(EventSerializer(event).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicAnnouncementList(_Public):
    @extend_schema(
        operation_id="public_announcements_list", responses=AnnouncementSerializer(many=True)
    )
    def get(self, request):
        rows = Announcement.objects.filter(services.public_q()).select_related(
            "cover", "created_by"
        )[:30]
        return Response(AnnouncementSerializer(rows, many=True).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicSiteSettingsView(_Public):
    @extend_schema(responses=SiteSettingsSerializer)
    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicMenuView(_Public):
    @extend_schema(responses=MenuSerializer)
    def get(self, request, key):
        return Response(MenuSerializer(get_object_or_404(Menu, key=key)).data)


@extend_schema(tags=["public"])
class PublicRedirectView(_Public):
    @extend_schema(
        parameters=[OpenApiParameter("path", str, required=True)], responses=RedirectSerializer
    )
    def get(self, request):
        redirect = get_object_or_404(Redirect, from_path=request.query_params.get("path", ""))
        Redirect.objects.filter(pk=redirect.pk).update(hits=redirect.hits + 1)
        return Response(RedirectSerializer(redirect).data, status=status.HTTP_200_OK)
