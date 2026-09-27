from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rbac
from audit.services import RequestMeta
from students.models import StudentRecord
from students.serializers import StudentRecordSerializer

from . import services
from .models import MisconductReport, Regulation, RegulationAcknowledgement, StudentCase
from .serializers import (
    CaseSerializer,
    DecisionSerializer,
    NoteSerializer,
    RegulationSerializer,
    ReportDecisionSerializer,
    ReportSerializer,
    StudentCaseSerializer,
    StudentStatusSerializer,
)


def _meta(request):
    return RequestMeta.from_request(request)


@extend_schema(tags=["student-affairs"])
class RegulationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Everyone reads published regulations; student affairs writes and publishes them."""

    serializer_class = RegulationSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["category", "status", "requires_acknowledgement"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Regulation.objects.none()
        queryset = Regulation.objects.select_related("file")
        if rbac.can(self.request.user, "regulations.manage"):
            # GROUP BY drops the model ordering; restate it for pagination.
            return queryset.annotate(acknowledgements_count=Count("acknowledgements")).order_by(
                "-published_at", "-created_at", "-id"
            )
        return queryset.filter(status=Regulation.Status.PUBLISHED)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user = getattr(self.request, "user", None)
        if user is not None and user.is_authenticated:
            record_ = StudentRecord.objects.filter(user=user).first()
            if record_ is not None:
                context["acknowledged"] = set(
                    RegulationAcknowledgement.objects.filter(student_record=record_).values_list(
                        "regulation_id", flat=True
                    )
                )
        return context

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        regulation = services.save_regulation(_meta(request), None, **data.validated_data)
        return Response(self.get_serializer(regulation).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        regulation = self.get_object()
        data = self.get_serializer(regulation, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        regulation = services.save_regulation(_meta(request), regulation, **data.validated_data)
        return Response(self.get_serializer(regulation).data)

    @extend_schema(request=None, responses=RegulationSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        regulation = services.publish_regulation(_meta(request), self.get_object())
        return Response(self.get_serializer(regulation).data)

    @extend_schema(request=None, responses={201: RegulationSerializer})
    @action(detail=True, methods=["post"], url_path="new-version")
    def new_version(self, request, public_id=None):
        draft = services.new_version(_meta(request), self.get_object())
        return Response(self.get_serializer(draft).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={201: None})
    @action(detail=True, methods=["post"])
    def acknowledge(self, request, public_id=None):
        services.acknowledge(_meta(request), self.get_object())
        return Response(status=status.HTTP_201_CREATED)


@extend_schema(tags=["student-affairs"])
class CaseViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Student cases. Student affairs manages; others read within their scope."""

    serializer_class = CaseSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["kind", "status", "published_to_student", "student_record__public_id"]
    search_fields = ["title", "student_record__university_number", "student_record__full_name_ar"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return StudentCase.objects.none()
        scope = rbac.scope_for(self.request.user, "cases.view")
        if scope.none:
            raise PermissionDenied()
        queryset = StudentCase.objects.select_related("student_record").prefetch_related(
            "events__by"
        )
        return scope.filter(queryset, "student_record__department")

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        case = services.open_case(_meta(request), **data.validated_data)
        return Response(self.get_serializer(case).data, status=status.HTTP_201_CREATED)

    def _done(self, case):
        case.refresh_from_db()
        return Response(self.get_serializer(case).data)

    @extend_schema(request=NoteSerializer, responses=CaseSerializer)
    @action(detail=True, methods=["post"])
    def notes(self, request, public_id=None):
        data = NoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._done(
            services.add_note(_meta(request), self.get_object(), data.validated_data["note"])
        )

    @extend_schema(request=DecisionSerializer, responses=CaseSerializer)
    @action(detail=True, methods=["post"])
    def decide(self, request, public_id=None):
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return self._done(services.decide(_meta(request), self.get_object(), **data.validated_data))

    @extend_schema(request=None, responses=CaseSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        return self._done(services.publish_case(_meta(request), self.get_object()))

    @extend_schema(request=None, responses=CaseSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, public_id=None):
        return self._done(services.set_closed(_meta(request), self.get_object(), True))

    @extend_schema(request=None, responses=CaseSerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request, public_id=None):
        return self._done(services.set_closed(_meta(request), self.get_object(), False))


@extend_schema(tags=["me"])
class MyCasesViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """The signed-in student's cases that student affairs published to them."""

    serializer_class = StudentCaseSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return StudentCase.objects.none()
        return StudentCase.objects.filter(
            student_record__user=self.request.user, published_to_student=True
        )


@extend_schema(tags=["student-affairs"])
class MisconductReportViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Teachers report; student affairs converts to a case or dismisses."""

    serializer_class = ReportSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["status", "offering"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return MisconductReport.objects.none()
        user = self.request.user
        queryset = MisconductReport.objects.select_related(
            "student_record", "offering__course", "reported_by", "case"
        )
        if rbac.can(user, "cases.manage"):
            return queryset
        visible = Q(reported_by=user)
        scope = rbac.scope_for(user, "cases.view")
        if scope.everything:
            return queryset
        if scope.departments:
            visible |= Q(offering__course__department__in=scope.departments)
        return queryset.filter(visible)

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        report = services.report_misconduct(_meta(request), **data.validated_data)
        return Response(self.get_serializer(report).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ReportDecisionSerializer, responses=ReportSerializer)
    @action(detail=True, methods=["post"])
    def resolve(self, request, public_id=None):
        data = ReportDecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        report = services.resolve_report(_meta(request), self.get_object(), **data.validated_data)
        return Response(self.get_serializer(report).data)


@extend_schema(tags=["student-affairs"])
class StudentStatusView(APIView):
    """Suspend or reinstate a student (student affairs, with a reason)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=StudentStatusSerializer, responses=StudentRecordSerializer)
    def post(self, request, public_id):
        student = get_object_or_404(StudentRecord, public_id=public_id)
        data = StudentStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        student = services.set_student_status(_meta(request), student, **data.validated_data)
        return Response(StudentRecordSerializer(student).data)
