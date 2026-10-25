from django.db import transaction
from django.db.models import F
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.translation import gettext
from django.views.decorators.cache import cache_control
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rbac
from audit.services import RequestMeta, record, snapshot
from core.permissions import capability
from core.throttles import PublicReadThrottle

from . import portal_icons, services
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
    MediaAltSerializer,
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
        obj = self._stamp(serializer.save(**{self.author_field: self.request.user}))
        record(_meta(self.request), f"{self.audit_name}.create", obj, new=snapshot(obj))
        self._maybe_rebuild(obj)

    def perform_update(self, serializer):
        old = snapshot(serializer.instance)
        obj = self._stamp(serializer.save())
        record(_meta(self.request), f"{self.audit_name}.update", obj, old=old, new=snapshot(obj))
        self._maybe_rebuild(obj)

    def perform_destroy(self, instance):
        record(_meta(self.request), f"{self.audit_name}.delete", instance, old=snapshot(instance))
        instance.delete()
        services.request_site_rebuild()

    @staticmethod
    def _stamp(obj):
        """Publishing from the editor dates the item like the publish action does (the site
        shows and sorts news by it)."""
        if (
            getattr(obj, "status", None) == Status.PUBLISHED
            and hasattr(obj, "publish_at")
            and obj.publish_at is None
        ):
            obj.publish_at = timezone.now()
            obj.save(update_fields=["publish_at"])
        return obj

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
    """The site team manages all news; the events manager the news linked to an event only
    (docs/03 §3.13 «خبر مرتبط»; review 2026-10-25 decisions, item 5)."""

    serializer_class = NewsSerializer
    capability_name = "news.manage"
    audit_name = "news"
    filterset_fields = ["status", "event"]
    search_fields = ["title", "slug"]

    def _all_news(self) -> bool:
        return rbac.can(self.request.user, "content.manage")

    def get_queryset(self):
        queryset = News.objects.select_related("cover", "event")
        return queryset if self._all_news() else queryset.filter(event__isnull=False)

    def _require_event(self, serializer):
        event = serializer.validated_data.get("event", getattr(serializer.instance, "event", None))
        if event is None and not self._all_news():
            raise ValidationError({"event": [gettext("Choose the event this news is about.")]})

    def perform_create(self, serializer):
        self._require_event(serializer)
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._require_event(serializer)
        super().perform_update(serializer)


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
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = MediaAssetSerializer
    queryset = MediaAsset.objects.all()
    lookup_field = "public_id"
    parser_classes = [MultiPartParser, JSONParser]
    # The picture itself is never replaced: only its description (alt text) is edited (U04).
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        return MediaAltSerializer if self.action == "partial_update" else MediaAssetSerializer

    def get_permissions(self):
        return [IsAuthenticated(), capability("events.manage")()]

    def perform_create(self, serializer):
        upload = serializer.validated_data["file"]
        asset = serializer.save(uploaded_by=self.request.user, size=upload.size)
        record(_meta(self.request), "media.upload", asset)

    def perform_update(self, serializer):
        asset = serializer.save()
        record(_meta(self.request), "media.update", asset)

    @extend_schema(request=MediaAltSerializer, responses=MediaAssetSerializer)
    def partial_update(self, request, *args, **kwargs):
        super().partial_update(request, *args, **kwargs)
        # Answer with the whole asset (url, size…), as the list does.
        return Response(MediaAssetSerializer(self.get_object(), context={"request": request}).data)

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
            for order, row in enumerate(data.validated_data, start=1):
                links = row.pop("children", [])
                row.pop("order", None)
                group = MenuItem.objects.create(menu=menu, order=order, **row)
                for sub, link in enumerate(links, start=1):
                    MenuItem.objects.create(menu=menu, parent=group, order=sub, **link)
            record(_meta(request), "menu.update", menu, new={"items": len(data.validated_data)})
        services.request_site_rebuild()
        return Response(MenuSerializer(menu).data)


@extend_schema(tags=["content"])
class SiteSettingsView(APIView):
    permission_classes = [IsAuthenticated, capability("content.manage")]

    @extend_schema(responses=SiteSettingsSerializer)
    def get(self, request):
        return Response(
            SiteSettingsSerializer(SiteSettings.load(), context={"request": request}).data
        )

    @extend_schema(request=SiteSettingsSerializer, responses=SiteSettingsSerializer)
    def patch(self, request):
        settings_ = SiteSettings.load()
        old = snapshot(settings_)
        data = SiteSettingsSerializer(
            settings_, data=request.data, partial=True, context={"request": request}
        )
        data.is_valid(raise_exception=True)
        data.save()
        record(_meta(request), "site.settings", settings_, old=old, new=snapshot(settings_))
        services.request_site_rebuild()
        return Response(data.data)


def _department(announcement) -> int | None:
    """The department an announcement is addressed within, for that department's log."""
    return services.department_of(announcement.scope, announcement.scope_id)


@extend_schema(tags=["announcements"])
class AnnouncementViewSet(viewsets.ModelViewSet):
    """Everyone reads the announcements meant for them; authors manage their own
    within the scopes docs/03 §7 allows."""

    serializer_class = AnnouncementSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["scope", "scope_id", "audience", "status"]
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
        record(
            _meta(self.request),
            "announcement.create",
            obj,
            new=snapshot(obj),
            department_id=_department(obj),
        )

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
        record(
            _meta(self.request),
            "announcement.update",
            obj,
            old=old,
            new=snapshot(obj),
            department_id=_department(obj),
        )

    def _still_allowed(self, obj):
        """Publishing or archiving re-checks the author's authority today: a revoked role or a
        teacher taken off the course cannot publish an old draft."""
        self._owned(obj)
        services.require_announce(self.request.user, obj.scope, obj.scope_id, obj.audience)

    def perform_destroy(self, instance):
        self._owned(instance)
        if not services.may_delete_announcement(self.request.user, instance):
            raise PermissionDenied(gettext("You may not delete this announcement."))
        record(
            _meta(self.request),
            "announcement.delete",
            instance,
            old=snapshot(instance),
            department_id=_department(instance),
        )
        instance.delete()

    @extend_schema(request=None, responses=AnnouncementSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        obj = self.get_object()
        self._still_allowed(obj)
        obj.status = Status.PUBLISHED
        obj.publish_at = obj.publish_at or timezone.now()
        obj.save(update_fields=["status", "publish_at", "updated_at"])
        record(_meta(request), "announcement.publish", obj, department_id=_department(obj))
        if obj.audience == Announcement.Audience.PUBLIC:
            services.request_site_rebuild()
        return Response(self.get_serializer(obj).data)

    @extend_schema(request=None, responses=AnnouncementSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, public_id=None):
        obj = self.get_object()
        self._still_allowed(obj)
        obj.status = Status.ARCHIVED
        obj.save(update_fields=["status", "updated_at"])
        record(_meta(request), "announcement.archive", obj, department_id=_department(obj))
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


class _PublicRead(_Public):
    """Cached, read-only site content: a higher per-IP limit (and none for the site build)."""

    throttle_classes = [PublicReadThrottle]


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicPageView(_PublicRead):
    @extend_schema(responses=PageSerializer)
    def get(self, request, slug):
        return Response(PageSerializer(get_object_or_404(_published(Page.objects), slug=slug)).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicNewsList(_PublicRead):
    @extend_schema(responses=NewsSerializer(many=True))
    def get(self, request):
        return Response(
            NewsSerializer(_published(News.objects.select_related("cover"))[:30], many=True).data
        )


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicNewsDetail(_PublicRead):
    @extend_schema(responses=NewsSerializer)
    def get(self, request, slug):
        return Response(NewsSerializer(get_object_or_404(_published(News.objects), slug=slug)).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicEventList(_PublicRead):
    """Upcoming events; ``?past=1`` lists ended ones, newest first (they keep their pages)."""

    @extend_schema(
        parameters=[OpenApiParameter("past", bool, required=False)],
        responses=EventSerializer(many=True),
    )
    def get(self, request):
        published = Event.objects.filter(status=Event.EventStatus.PUBLISHED).select_related("cover")
        now = timezone.now()
        if request.query_params.get("past") in ("1", "true"):
            rows = published.filter(ends_at__lt=now).order_by("-starts_at")
        else:
            rows = published.filter(ends_at__gte=now)
        return Response(EventSerializer(rows[:50], many=True).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicEventDetail(_PublicRead):
    @extend_schema(responses=EventSerializer)
    def get(self, request, slug):
        event = get_object_or_404(Event.objects.exclude(status=Event.EventStatus.DRAFT), slug=slug)
        return Response(EventSerializer(event).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicAnnouncementList(_PublicRead):
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
class PublicSiteSettingsView(_PublicRead):
    @extend_schema(responses=SiteSettingsSerializer)
    def get(self, request):
        return Response(
            SiteSettingsSerializer(SiteSettings.load(), context={"request": request}).data
        )


@extend_schema(tags=["public"], responses={200: OpenApiTypes.BINARY, 302: None})
class PublicPortalIconView(_PublicRead):
    """The portal app's icon for `kind` (192, 512, maskable-512, apple-touch), cut from the logo
    in the site settings; the built-in icon (a redirect) while no logo is set. An installed app
    and the browser's tab read it, so the app follows the logo (owner, 2026-10-17)."""

    def get(self, request, kind):
        spec = portal_icons.ICONS.get(kind)
        if spec is None:
            raise Http404
        logo = SiteSettings.load().logo
        if logo is None:
            return HttpResponseRedirect(spec.fallback)
        try:
            png = portal_icons.icon_png(logo, kind)
        except (OSError, ValueError):  # the file is gone or not an image: the built-in icon
            return HttpResponseRedirect(spec.fallback)
        response = HttpResponse(png, content_type="image/png")
        # An hour: a new logo reaches installed apps and tabs within it (the browsers re-read the
        # icon when they check the manifest), without every visit rendering or fetching it again.
        response["Cache-Control"] = "public, max-age=3600"
        return response


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicMenuView(_PublicRead):
    @extend_schema(responses=MenuSerializer)
    def get(self, request, key):
        return Response(MenuSerializer(get_object_or_404(Menu, key=key)).data)


@extend_schema(tags=["public"])
class PublicRedirectView(_PublicRead):
    @extend_schema(
        parameters=[OpenApiParameter("path", str, required=True)], responses=RedirectSerializer
    )
    def get(self, request):
        redirect = get_object_or_404(Redirect, from_path=request.query_params.get("path", ""))
        Redirect.objects.filter(pk=redirect.pk).update(hits=F("hits") + 1)
        return Response(RedirectSerializer(redirect).data, status=status.HTTP_200_OK)
