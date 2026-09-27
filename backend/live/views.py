from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.services import RequestMeta

from . import services
from .models import LiveSession
from .serializers import JoinSerializer, LiveSessionSerializer


@extend_schema(tags=["live"])
class LiveSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Live sessions the caller may see. The join link is never listed; ask /join."""

    serializer_class = LiveSessionSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["offering", "status", "scope"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return LiveSession.objects.none()
        return LiveSession.objects.filter(services.visible_q(self.request.user)).select_related(
            "offering__course", "program", "host"
        )

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        session = services.save(RequestMeta.from_request(request), None, **data.validated_data)
        return Response(self.get_serializer(session).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        session = self.get_object()
        data = self.get_serializer(session, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = {
            k: v
            for k, v in data.validated_data.items()
            if k not in ("scope", "offering", "program", "level")
        }
        session = services.save(RequestMeta.from_request(request), session, **values)
        return Response(self.get_serializer(session).data)

    @extend_schema(request=None, responses=JoinSerializer)
    @action(detail=True, methods=["get"])
    def join(self, request, public_id=None):
        return Response({"url": services.join_link(request.user, self.get_object())})

    @extend_schema(request=None, responses=LiveSessionSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, public_id=None):
        session = services.cancel(RequestMeta.from_request(request), self.get_object())
        return Response(self.get_serializer(session).data)
