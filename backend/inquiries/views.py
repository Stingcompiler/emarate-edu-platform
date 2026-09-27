from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from audit.services import RequestMeta

from . import services
from .models import Inquiry
from .serializers import (
    AssignSerializer,
    InquirySerializer,
    PublicInquirySerializer,
    PublicReceiptSerializer,
    ReplySerializer,
    RerouteSerializer,
    TransitionSerializer,
    WhatsAppLinkSerializer,
    WhatsAppSerializer,
)


class ContactThrottle(AnonRateThrottle):
    scope = "contact"  # docs/05 §7: 5/hour per IP


@extend_schema(tags=["public"])
class PublicInquiryView(APIView):
    """The site's contact form. Returns a reference number to follow up with."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ContactThrottle]

    @extend_schema(request=PublicInquirySerializer, responses={201: PublicReceiptSerializer})
    def post(self, request):
        data = PublicInquirySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        if values.pop("website"):
            # Bots fill hidden fields; answer like a success and store nothing.
            return Response(
                {"reference_no": "INQ-00-000000", "status": "new", "status_label": "جديد"},
                status=status.HTTP_201_CREATED,
            )
        inquiry = services.submit(**values)
        return Response(
            {
                "reference_no": inquiry.reference_no,
                "status": inquiry.status,
                "status_label": inquiry.get_status_display(),
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["public"])
class PublicInquiryStatusView(APIView):
    """The reference number alone shows only the status (docs/03 §9: no names, no messages)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ContactThrottle]

    @extend_schema(operation_id="public_inquiry_status", responses=PublicReceiptSerializer)
    def get(self, request, reference_no):
        inquiry = get_object_or_404(Inquiry, reference_no=reference_no.upper())
        return Response(
            {
                "reference_no": inquiry.reference_no,
                "status": inquiry.status,
                "status_label": inquiry.get_status_display(),
            }
        )


@extend_schema(tags=["inquiries"])
class InquiryViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = InquirySerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["status", "type", "department"]
    search_fields = [
        "reference_no",
        "subject",
        "contact__name",
        "contact__email",
        "contact__phone_e164",
    ]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Inquiry.objects.none()
        return (
            Inquiry.objects.filter(services.visible_q(self.request.user))
            .select_related("contact", "department", "assigned_to")
            .prefetch_related("messages__author", "history__by")
        )

    def _done(self, inquiry):
        return Response(self.get_serializer(Inquiry.objects.get(pk=inquiry.pk)).data)

    @extend_schema(request=ReplySerializer, responses=InquirySerializer)
    @action(detail=True, methods=["post"])
    def reply(self, request, public_id=None):
        data = ReplySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        inquiry = self.get_object()
        services.reply(RequestMeta.from_request(request), inquiry, **data.validated_data)
        return self._done(inquiry)

    @extend_schema(request=WhatsAppSerializer, responses=WhatsAppLinkSerializer)
    @action(detail=True, methods=["post"])
    def whatsapp(self, request, public_id=None):
        data = WhatsAppSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        url = services.whatsapp(
            RequestMeta.from_request(request), self.get_object(), **data.validated_data
        )
        return Response({"url": url})

    @extend_schema(request=TransitionSerializer, responses=InquirySerializer)
    @action(detail=True, methods=["post"])
    def transition(self, request, public_id=None):
        data = TransitionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._done(
            services.transition(
                RequestMeta.from_request(request), self.get_object(), **data.validated_data
            )
        )

    @extend_schema(request=AssignSerializer, responses=InquirySerializer)
    @action(detail=True, methods=["post"])
    def assign(self, request, public_id=None):
        data = AssignSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._done(
            services.assign(
                RequestMeta.from_request(request), self.get_object(), data.validated_data["user"]
            )
        )

    @extend_schema(request=RerouteSerializer, responses=InquirySerializer)
    @action(detail=True, methods=["post"])
    def reroute(self, request, public_id=None):
        data = RerouteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._done(
            services.reroute(
                RequestMeta.from_request(request),
                self.get_object(),
                type=data.validated_data["type"],
                department=data.validated_data.get("department"),
            )
        )
