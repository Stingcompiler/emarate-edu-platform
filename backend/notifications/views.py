from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rbac
from audit.services import RequestMeta, record
from core.idempotency import run_once

from . import audience as audiences
from . import push, services
from .models import (
    Category,
    HRNotice,
    Notification,
    NotificationPreference,
    NotificationRecipient,
    PushSubscription,
)
from .serializers import (
    AudienceCountSerializer,
    AudienceOptionSerializer,
    AudienceSerializer,
    HRNoticeSerializer,
    InboxItemSerializer,
    PreferenceSerializer,
    PushConfigSerializer,
    PushSubscribeSerializer,
    PushUnsubscribeSerializer,
    SendSerializer,
    SentNotificationSerializer,
    UnreadCountSerializer,
)


@extend_schema(tags=["notifications"])
class InboxViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The signed-in user's notifications, newest first."""

    serializer_class = InboxItemSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = {"notification__category": ["exact"], "read_at": ["isnull"]}

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return NotificationRecipient.objects.none()
        rows = NotificationRecipient.objects.filter(
            user=self.request.user, notification__hidden_at__isnull=True
        ).select_related("notification__sender")
        # Platform alerts are for the people who run it (design review B5).
        if not rbac.is_admin(self.request.user):
            rows = rows.exclude(notification__category=Category.OPS)
        return rows

    @extend_schema(request=None, responses=InboxItemSerializer)
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        item = self.get_object()
        if item.read_at is None:
            item.read_at = timezone.now()
            item.save(update_fields=["read_at"])
        return Response(self.get_serializer(item).data)

    @extend_schema(request=None, responses=UnreadCountSerializer)
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return self.unread_count(request)

    @extend_schema(responses=UnreadCountSerializer)
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        rows = (
            self.get_queryset()
            .filter(read_at__isnull=True)
            .values("notification__category")
            .annotate(n=Count("id"))
            .order_by()
        )
        by_category = {row["notification__category"]: row["n"] for row in rows}
        return Response({"count": sum(by_category.values()), "by_category": by_category})


@extend_schema(tags=["notifications"])
class SentViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Notifications the caller sent, with how many recipients read them. Deleting one is a
    request the system admin or supervisor approves; the system admin deletes at once (owner,
    2026-11-05)."""

    serializer_class = SentNotificationSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"

    @extend_schema(responses={204: None, 202: None})
    def destroy(self, request, *args, **kwargs):
        from content import deletions
        from content.serializers import DeletionRequestSerializer

        notification = self.get_object()  # the caller's own only (get_queryset)
        meta = RequestMeta.from_request(request)
        kind = deletions.K.NOTIFICATION
        if deletions.deletes_at_once(request.user, kind):
            with transaction.atomic():
                deletions.delete_now(meta, kind, notification)
            return Response(status=status.HTTP_204_NO_CONTENT)
        req = deletions.request(meta, kind, notification, request.data.get("reason", ""))
        return Response(DeletionRequestSerializer(req).data, status=status.HTTP_202_ACCEPTED)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        return (
            Notification.objects.filter(sender=self.request.user)
            .annotate(read_count=Count("recipients", filter=Q(recipients__read_at__isnull=False)))
            .order_by("-created_at", "-id")
        )

    @extend_schema(request=SendSerializer, responses={201: SentNotificationSerializer})
    def create(self, request):
        def perform():
            data = SendSerializer(data=request.data)
            data.is_valid(raise_exception=True)
            notification = services.send(RequestMeta.from_request(request), **data.validated_data)
            return Response(
                SentNotificationSerializer(notification).data, status=status.HTTP_201_CREATED
            )

        return run_once(request, perform)

    def _hide(self, request, hidden: bool):
        notification = self.get_object()  # the caller's own only (get_queryset)
        with transaction.atomic():
            notification.hidden_at = timezone.now() if hidden else None
            notification.hidden_by = request.user if hidden else None
            notification.save(update_fields=["hidden_at", "hidden_by"])
            record(
                RequestMeta.from_request(request),
                "notification.hide" if hidden else "notification.restore",
                notification,
                new={"title": notification.title},
            )
        return Response(self.get_serializer(self._annotated(notification)).data)

    def _annotated(self, notification):
        return self.get_queryset().get(pk=notification.pk)

    @extend_schema(request=None, responses=SentNotificationSerializer)
    @action(detail=True, methods=["post"])
    def hide(self, request, public_id=None):
        """Soft delete: off every inbox now, kept and restorable (owner, 2026-11-05)."""
        return self._hide(request, True)

    @extend_schema(request=None, responses=SentNotificationSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, public_id=None):
        return self._hide(request, False)

    @extend_schema(request=AudienceSerializer, responses=AudienceCountSerializer)
    @action(detail=False, methods=["post"], url_path="preview")
    def preview(self, request):
        data = AudienceSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        clean = audiences.authorize(request.user, data.validated_data["audience"])
        return Response({"count": audiences.resolve(clean).count()})

    @extend_schema(responses=AudienceOptionSerializer(many=True))
    @action(detail=False, methods=["get"], pagination_class=None)
    def audiences(self, request):
        return Response(audiences.options(request.user))


@extend_schema(tags=["notifications"])
class PreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def _all(self, user) -> list[dict]:
        saved = {p.category: p for p in NotificationPreference.objects.filter(user=user)}
        rows = []
        for category in Category.values:
            if category == Category.OPS and not rbac.is_admin(user):
                continue
            pref = saved.get(category) or services._default(category)
            rows.append(
                {"category": category, "inapp": pref.inapp, "push": pref.push, "email": pref.email}
            )
        return rows

    @extend_schema(responses=PreferenceSerializer(many=True))
    def get(self, request):
        return Response(self._all(request.user))

    @extend_schema(
        request=PreferenceSerializer(many=True), responses=PreferenceSerializer(many=True)
    )
    def put(self, request):
        data = PreferenceSerializer(data=request.data, many=True)
        data.is_valid(raise_exception=True)
        for row in data.validated_data:
            NotificationPreference.objects.update_or_create(
                user=request.user,
                category=row["category"],
                defaults={"inapp": row["inapp"], "push": row["push"], "email": row["email"]},
            )
        return Response(self._all(request.user))


@extend_schema(tags=["push"])
class PushConfigView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PushConfigSerializer)
    def get(self, request):
        keys = push.keys()
        return Response({"enabled": keys is not None, "public_key": keys and keys["public"]})


@extend_schema(tags=["push"])
class PushSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PushSubscribeSerializer, responses={201: None})
    def post(self, request):
        data = PushSubscribeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        # An endpoint belongs to one browser; re-subscribing moves it to this user.
        PushSubscription.objects.update_or_create(
            endpoint=values["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": values["keys"]["p256dh"],
                "auth": values["keys"]["auth"],
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
            },
        )
        return Response(status=status.HTTP_201_CREATED)


@extend_schema(tags=["push"])
class PushUnsubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PushUnsubscribeSerializer, responses={204: None})
    def post(self, request):
        data = PushUnsubscribeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        PushSubscription.objects.filter(
            user=request.user, endpoint=data.validated_data["endpoint"]
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["notifications"])
class HRNoticeViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """HR sees every notice; a teacher sees the notices addressed to them."""

    serializer_class = HRNoticeSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["teacher__public_id", "requires_ack"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return HRNotice.objects.none()
        user = self.request.user
        queryset = HRNotice.objects.select_related("teacher", "sent_by", "term")
        if rbac.can(user, "hr.view"):
            return queryset
        return queryset.filter(teacher=user)

    def retrieve(self, request, *args, **kwargs):
        notice = services.open_hr_notice(self.get_object(), request.user)
        return Response(self.get_serializer(notice).data)

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        notice = services.create_hr_notice(RequestMeta.from_request(request), **data.validated_data)
        return Response(self.get_serializer(notice).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=HRNoticeSerializer)
    @action(detail=True, methods=["post"])
    def acknowledge(self, request, public_id=None):
        notice = self.get_object()
        if notice.teacher_id != request.user.pk:
            raise NotFound()
        notice = services.acknowledge_hr_notice(RequestMeta.from_request(request), notice)
        return Response(self.get_serializer(notice).data)
