from django.core.cache import cache
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import RequestMeta, record, snapshot
from contacts import visitor
from contacts.visitor import IsVisitor, VisitorAuthentication
from core.permissions import capability
from inquiries.models import Inquiry, InquiryMessage
from inquiries.views import ContactThrottle

from . import services
from .models import (
    AdmissionCycle,
    Application,
    ApplicationDocument,
    ApplicationFormTemplate,
    ProgramIntake,
)
from .serializers import (
    ApplicantApplicationSerializer,
    ApplicantBodySerializer,
    ApplicationAssignSerializer,
    ApplicationDocumentReviewSerializer,
    ApplicationDocumentSerializer,
    ApplicationDocumentUploadSerializer,
    ApplicationStaffMessageSerializer,
    ApplicationStartSerializer,
    ApplicationTransitionSerializer,
    ApplicationUpdateSerializer,
    CycleSerializer,
    DocumentLinkSerializer,
    IntakeSerializer,
    OTPStartSerializer,
    OTPVerifySerializer,
    PublicIntakeSerializer,
    StaffApplicationSerializer,
    StatusOnlySerializer,
    TemplateSerializer,
    VisitorTokenSerializer,
)


def _meta(request):
    return RequestMeta.from_request(request)


class _Audited(viewsets.ModelViewSet):
    audit_name = ""

    def get_permissions(self):
        return [IsAuthenticated(), capability("admissions.view", "admissions.manage")()]

    def perform_create(self, serializer):
        record(_meta(self.request), f"admissions.{self.audit_name}_create", serializer.save())

    def perform_update(self, serializer):
        old = snapshot(serializer.instance)
        obj = serializer.save()
        record(
            _meta(self.request),
            f"admissions.{self.audit_name}_update",
            obj,
            old=old,
            new=snapshot(obj),
        )

    def perform_destroy(self, instance):
        if hasattr(instance, "applications") and instance.applications.exists():
            from core.errors import Conflict

            raise Conflict("Applications exist; close the intake instead.", code="in_use")
        record(_meta(self.request), f"admissions.{self.audit_name}_delete", instance)
        instance.delete()


@extend_schema(tags=["admissions"])
class CycleViewSet(_Audited):
    serializer_class = CycleSerializer
    queryset = AdmissionCycle.objects.all()
    audit_name = "cycle"


@extend_schema(tags=["admissions"])
class IntakeViewSet(_Audited):
    serializer_class = IntakeSerializer
    audit_name = "intake"
    filterset_fields = ["cycle", "program", "is_open"]

    def get_queryset(self):
        return (
            ProgramIntake.objects.select_related("program__department", "cycle")
            .annotate(applications_count=Count("applications"))
            .order_by("cycle", "program__name_ar", "id")
        )


@extend_schema(tags=["admissions"])
class TemplateViewSet(_Audited):
    serializer_class = TemplateSerializer
    queryset = ApplicationFormTemplate.objects.all()
    audit_name = "template"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        return [IsAuthenticated(), capability("admissions.review", "admissions.manage")()]

    def perform_create(self, serializer):
        record(
            _meta(self.request),
            "admissions.template_create",
            serializer.save(created_by=self.request.user),
        )

    def perform_update(self, serializer):
        if serializer.instance.status != ApplicationFormTemplate.Status.DRAFT:
            from core.errors import Conflict

            raise Conflict("A published template is frozen; create a new version.", code="frozen")
        super().perform_update(serializer)

    @extend_schema(request=None, responses=TemplateSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return Response(
            self.get_serializer(services.publish_template(_meta(request), self.get_object())).data
        )

    @extend_schema(request=None, responses={201: TemplateSerializer})
    @action(detail=True, methods=["post"], url_path="new-version")
    def new_version(self, request, pk=None):
        draft = services.new_template_version(_meta(request), self.get_object())
        return Response(self.get_serializer(draft).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["admissions"])
class ApplicationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = StaffApplicationSerializer
    permission_classes = [IsAuthenticated, capability("admissions.view")]
    lookup_field = "public_id"
    filterset_fields = [
        "status",
        "intake",
        "intake__program__department",
        "assigned_registrar__public_id",
    ]
    search_fields = ["reference_no", "full_name", "email", "phone_e164"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Application.objects.none()
        return (
            Application.objects.filter(services.staff_q(self.request.user))
            .exclude(status=Application.Status.DRAFT)
            .select_related(
                "intake__program__department",
                "intake__cycle",
                "assigned_registrar",
                "student_record",
                "form_template",
            )
            .prefetch_related("history__changed_by", "messages__author", "documents")
        )

    def _done(self, application):
        return Response(self.get_serializer(self.get_queryset().get(pk=application.pk)).data)

    @extend_schema(request=None, responses=StaffApplicationSerializer)
    @action(detail=True, methods=["post"])
    def claim(self, request, public_id=None):
        return self._done(services.claim(_meta(request), self.get_object()))

    @extend_schema(request=ApplicationAssignSerializer, responses=StaffApplicationSerializer)
    @action(detail=True, methods=["post"])
    def assign(self, request, public_id=None):
        data = ApplicationAssignSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._done(
            services.assign(_meta(request), self.get_object(), data.validated_data["registrar"])
        )

    @extend_schema(request=ApplicationTransitionSerializer, responses=StaffApplicationSerializer)
    @action(detail=True, methods=["post"])
    def transition(self, request, public_id=None):
        data = ApplicationTransitionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._done(
            services.transition(_meta(request), self.get_object(), **data.validated_data)
        )

    @extend_schema(request=ApplicationStaffMessageSerializer, responses=StaffApplicationSerializer)
    @action(detail=True, methods=["post"])
    def messages(self, request, public_id=None):
        data = ApplicationStaffMessageSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        application = self.get_object()
        services.staff_message(_meta(request), application, **data.validated_data)
        return self._done(application)

    @extend_schema(request=None, responses=StaffApplicationSerializer)
    @action(detail=True, methods=["post"])
    def register(self, request, public_id=None):
        application = self.get_object()
        services.register_applicant(_meta(request), application)
        return self._done(application)

    @extend_schema(responses=DocumentLinkSerializer)
    @action(detail=True, methods=["get"], url_path=r"documents/(?P<document_id>[0-9a-f-]+)/link")
    def document_link(self, request, public_id=None, document_id=None):
        application = self.get_object()
        services.require_review(request.user, application)
        document = get_object_or_404(
            ApplicationDocument, public_id=document_id, application=application
        )
        url, expires_at = services.document_link(document)
        return Response({"url": url, "expires_at": expires_at})

    @extend_schema(
        request=ApplicationDocumentReviewSerializer, responses=ApplicationDocumentSerializer
    )
    @action(detail=True, methods=["post"], url_path=r"documents/(?P<document_id>[0-9a-f-]+)/review")
    def document_review(self, request, public_id=None, document_id=None):
        application = self.get_object()
        document = get_object_or_404(
            ApplicationDocument, public_id=document_id, application=application
        )
        data = ApplicationDocumentReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            ApplicationDocumentSerializer(
                services.review_document(_meta(request), document, **data.validated_data)
            ).data
        )

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Counters for the head registrar / registrar dashboards."""
        rows = (
            Application.objects.filter(services.staff_q(request.user))
            .exclude(status=Application.Status.DRAFT)
            .values("status", "intake__program__department__name_ar")
            .annotate(n=Count("id"))
            .order_by()
        )
        by_status: dict[str, int] = {}
        by_department: dict[str, int] = {}
        for row in rows:
            by_status[row["status"]] = by_status.get(row["status"], 0) + row["n"]
            name = row["intake__program__department__name_ar"]
            by_department[name] = by_department.get(name, 0) + row["n"]
        unassigned = Application.objects.filter(
            services.staff_q(request.user),
            assigned_registrar__isnull=True,
            status=Application.Status.SUBMITTED,
        ).count()
        return Response(
            {"by_status": by_status, "by_department": by_department, "unassigned": unassigned}
        )


# ─── Public ───────────────────────────────────────────────────────────────


class _Public(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []


@extend_schema(tags=["public"])
class PublicIntakesView(_Public):
    @extend_schema(operation_id="public_intakes_get", responses=PublicIntakeSerializer(many=True))
    def get(self, request):
        now = timezone.now()
        rows = ProgramIntake.objects.filter(
            is_open=True, cycle__is_active=True, cycle__opens_at__lte=now, cycle__closes_at__gt=now
        ).select_related("program__department", "cycle")
        return Response(
            PublicIntakeSerializer([r for r in rows if r.accepting(now)], many=True).data
        )


@extend_schema(tags=["public"])
class PublicIntakeView(_Public):
    @extend_schema(operation_id="public_intake_get", responses=PublicIntakeSerializer)
    def get(self, request, pk):
        intake = get_object_or_404(
            ProgramIntake.objects.select_related("program__department", "cycle"), pk=pk
        )
        return Response(PublicIntakeSerializer(intake, context={"with_form": True}).data)


@extend_schema(tags=["public"])
class VisitorOTPView(_Public):
    throttle_classes = [ContactThrottle]

    @extend_schema(
        operation_id="public_visitor_otp_post", request=OTPStartSerializer, responses={200: dict}
    )
    def post(self, request):
        data = OTPStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        visitor.start(data.validated_data["email"])
        return Response({"detail": "A code was sent to the email."})


@extend_schema(tags=["public"])
class VisitorVerifyView(_Public):
    @extend_schema(
        operation_id="public_visitor_verify_post",
        request=OTPVerifySerializer,
        responses=VisitorTokenSerializer,
    )
    def post(self, request):
        data = OTPVerifySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        token, session = visitor.verify(
            data.validated_data["email"],
            data.validated_data["code"],
            name=data.validated_data["name"],
            ip=RequestMeta.from_request(request).ip,
        )
        return Response(
            {"token": token, "expires_at": session.expires_at, "name": session.contact.name}
        )


@extend_schema(tags=["public"])
class PublicApplicationStatusView(_Public):
    throttle_classes = [ContactThrottle]

    @extend_schema(operation_id="public_application_status", responses=StatusOnlySerializer)
    def get(self, request, reference_no):
        application = get_object_or_404(Application, reference_no=reference_no.upper())
        return Response(
            {
                "reference_no": application.reference_no,
                "status": application.status,
                "status_label": application.get_status_display(),
            }
        )


# ─── Visitor (verified contact) ───────────────────────────────────────────


class _Visitor(APIView):
    authentication_classes = [VisitorAuthentication]
    permission_classes = [IsVisitor]


@extend_schema(tags=["visitor"])
class VisitorMeView(_Visitor):
    @extend_schema(operation_id="visitor_me_get", responses={200: dict})
    def get(self, request):
        contact = request.contact
        inquiries = Inquiry.objects.filter(contact=contact).prefetch_related("messages")
        return Response(
            {
                "name": contact.name,
                "email": contact.email,
                "applications": ApplicantApplicationSerializer(
                    Application.objects.filter(contact=contact).select_related(
                        "intake__program", "form_template"
                    ),
                    many=True,
                ).data,
                "inquiries": [
                    {
                        "public_id": str(i.public_id),
                        "reference_no": i.reference_no,
                        "subject": i.subject,
                        "status": i.status,
                        "status_label": i.get_status_display(),
                        "created_at": i.created_at,
                        "messages": [
                            {
                                "from_college": m.author_id is not None,
                                "body": m.body,
                                "sent_at": m.sent_at,
                            }
                            for m in i.messages.all()
                            if m.channel != InquiryMessage.Channel.INTERNAL
                        ],
                    }
                    for i in inquiries
                ],
            }
        )


@extend_schema(tags=["visitor"])
class VisitorApplicationsView(_Visitor):
    @extend_schema(
        operation_id="visitor_applications_post",
        request=ApplicationStartSerializer,
        responses={201: ApplicantApplicationSerializer},
    )
    def post(self, request):
        data = ApplicationStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        application = services.start(request.contact, data.validated_data["intake"])
        return Response(
            ApplicantApplicationSerializer(application).data, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["visitor"])
class VisitorApplicationView(_Visitor):
    parser_classes = [JSONParser]

    @extend_schema(operation_id="visitor_application_get", responses=ApplicantApplicationSerializer)
    def get(self, request, public_id):
        return Response(
            ApplicantApplicationSerializer(services.own(request.contact, public_id)).data
        )

    @extend_schema(
        operation_id="visitor_application_patch",
        request=ApplicationUpdateSerializer,
        responses=ApplicantApplicationSerializer,
    )
    def patch(self, request, public_id):
        data = ApplicationUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        application = services.update(
            request.contact, services.own(request.contact, public_id), **data.validated_data
        )
        return Response(ApplicantApplicationSerializer(application).data)


@extend_schema(tags=["visitor"])
class VisitorDocumentsView(_Visitor):
    parser_classes = [MultiPartParser]

    @extend_schema(
        operation_id="visitor_documents_post",
        request={"multipart/form-data": ApplicationDocumentUploadSerializer},
        responses={201: ApplicationDocumentSerializer},
    )
    def post(self, request, public_id):
        data = ApplicationDocumentUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        document = services.add_document(
            request.contact,
            services.own(request.contact, public_id),
            data.validated_data["doc_type"],
            data.validated_data["file"],
        )
        return Response(
            ApplicationDocumentSerializer(document).data, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["visitor"])
class VisitorSubmitView(_Visitor):
    @extend_schema(
        operation_id="visitor_submit_post",
        request=None,
        responses=ApplicantApplicationSerializer,
    )
    def post(self, request, public_id):
        # Idempotency-Key (docs/05 §7): a retried submit returns the first response.
        key = request.META.get("HTTP_IDEMPOTENCY_KEY", "")[:100]
        cache_key = f"idem:submit:{request.contact.pk}:{key}" if key else None
        if cache_key and (hit := cache.get(cache_key)) is not None:
            return Response(hit)
        application = services.submit(request.contact, services.own(request.contact, public_id))
        payload = ApplicantApplicationSerializer(application).data
        if cache_key:
            cache.set(cache_key, payload, timeout=24 * 3600)
        return Response(payload)


@extend_schema(tags=["visitor"])
class VisitorWithdrawView(_Visitor):
    @extend_schema(
        operation_id="visitor_withdraw_post",
        request=None,
        responses=ApplicantApplicationSerializer,
    )
    def post(self, request, public_id):
        return Response(
            ApplicantApplicationSerializer(
                services.withdraw(request.contact, services.own(request.contact, public_id))
            ).data
        )


@extend_schema(tags=["visitor"])
class VisitorMessageView(_Visitor):
    @extend_schema(
        operation_id="visitor_message_post",
        request=ApplicantBodySerializer,
        responses={201: None},
    )
    def post(self, request, public_id):
        data = ApplicantBodySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.applicant_message(
            request.contact, services.own(request.contact, public_id), data.validated_data["body"]
        )
        return Response(status=status.HTTP_201_CREATED)


@extend_schema(tags=["visitor"])
class VisitorInquiryReplyView(_Visitor):
    @extend_schema(
        operation_id="visitor_inquiry_reply_post",
        request=ApplicantBodySerializer,
        responses={201: None},
    )
    def post(self, request, public_id):
        data = ApplicantBodySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        inquiry = get_object_or_404(Inquiry, public_id=public_id, contact=request.contact)
        if inquiry.status == Inquiry.Status.CLOSED:
            raise PermissionDenied("This inquiry is closed.")
        InquiryMessage.objects.create(
            inquiry=inquiry, channel=InquiryMessage.Channel.PORTAL, body=data.validated_data["body"]
        )
        if inquiry.status == Inquiry.Status.WAITING_FOR_USER:
            inquiry.status = Inquiry.Status.IN_PROGRESS
            inquiry.save(update_fields=["status", "updated_at"])
        return Response(status=status.HTTP_201_CREATED)
