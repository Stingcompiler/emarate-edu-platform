import csv

from django.db.models import Q
from django.http import HttpResponse
from django.utils.translation import gettext
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academic.models import OfferingInstructor
from accounts import rbac
from audit.services import RequestMeta, record, snapshot
from core.permissions import capability
from students.importer import ImportFileError
from students.models import StudentRecord

from . import importer, services
from .models import (
    AcademicResult,
    GradingScale,
    ResultCorrection,
    ResultDisplaySettings,
    ResultImportBatch,
    TermResultRelease,
)
from .serializers import (
    CorrectionDecisionSerializer,
    CorrectionRequestSerializer,
    CorrectionSerializer,
    DisplaySettingsSerializer,
    GradingScaleSerializer,
    MyResultsSerializer,
    ResultBatchSerializer,
    ResultRowSerializer,
    ResultSerializer,
    ResultUploadSerializer,
    TermReleaseSerializer,
)


def _meta(request):
    return RequestMeta.from_request(request)


@extend_schema(tags=["results"])
class ResultImportViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Upload the finished results file → preview → commit → publish (docs/03 §3.4)."""

    serializer_class = ResultBatchSerializer
    permission_classes = [IsAuthenticated, capability("results.view", "results.manage")]
    parser_classes = [MultiPartParser, JSONParser]
    lookup_field = "public_id"
    filterset_fields = ["term", "status", "department"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ResultImportBatch.objects.none()
        scope = rbac.scope_for(self.request.user, "results.view")
        queryset = ResultImportBatch.objects.select_related("uploaded_by", "term", "department")
        if scope.everything:
            return queryset
        return queryset.filter(department__in=scope.departments)

    @extend_schema(
        request={"multipart/form-data": ResultUploadSerializer},
        responses={201: ResultBatchSerializer},
    )
    def create(self, request):
        data = ResultUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        department = data.validated_data.get("department")
        scope = rbac.scope_for(request.user, "results.manage")
        if department is None and not scope.everything:
            raise ValidationError({"department": [gettext("Choose your department.")]})
        if department is not None and not scope.allows(department.pk):
            raise PermissionDenied(gettext("Outside your department."))
        allowed = None if scope.everything else set(scope.departments)
        file = data.validated_data["file"]
        try:
            batch = importer.validate_file(
                _meta(request),
                term=data.validated_data["term"],
                department=department,
                allowed_departments=allowed,
                name=file.name,
                uploaded=file,
            )
        except ImportFileError as error:
            raise ValidationError({"file": [str(error)]}) from None
        except UnicodeDecodeError:
            raise ValidationError({"file": [gettext("Save the CSV as UTF-8.")]}) from None
        return Response(ResultBatchSerializer(batch).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        responses=ResultRowSerializer(many=True),
        parameters=[OpenApiParameter("action", str, enum=["create", "error"])],
    )
    @action(detail=True, methods=["get"])
    def rows(self, request, public_id=None):
        rows = self.get_object().rows.all()
        if request.query_params.get("action"):
            rows = rows.filter(action=request.query_params["action"])
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(ResultRowSerializer(page, many=True).data)

    @extend_schema(request=None, responses=ResultBatchSerializer)
    @action(detail=True, methods=["post"])
    def commit(self, request, public_id=None):
        return Response(
            ResultBatchSerializer(services.commit(_meta(request), self.get_object())).data
        )

    @extend_schema(request=None, responses=ResultBatchSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        batch = services.set_published(_meta(request), self.get_object(), True)
        return Response(ResultBatchSerializer(batch).data)

    @extend_schema(request=None, responses=ResultBatchSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, public_id=None):
        batch = services.set_published(_meta(request), self.get_object(), False)
        return Response(ResultBatchSerializer(batch).data)

    def perform_destroy(self, instance):
        services.reject(_meta(self.request), instance)


@extend_schema(tags=["results"])
class ResultViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Committed results: results staff by scope; teachers for the courses they teach."""

    serializer_class = ResultSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["term", "offering", "is_published", "status", "student_record__public_id"]
    search_fields = ["student_record__university_number", "student_record__full_name_ar"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AcademicResult.objects.none()
        user = self.request.user
        scope = rbac.scope_for(user, "results.view")
        queryset = AcademicResult.objects.select_related(
            "student_record", "offering__course", "term"
        )
        if scope.everything:
            return queryset
        teaching = OfferingInstructor.objects.filter(user=user, role="teacher").values(
            "offering_id"
        )
        visible = Q(offering_id__in=teaching)
        if scope.departments:
            visible |= Q(offering__course__department__in=scope.departments)
        return queryset.filter(visible)

    @extend_schema(request=CorrectionRequestSerializer, responses={201: CorrectionSerializer})
    @action(detail=True, methods=["post"])
    def corrections(self, request, pk=None):
        data = CorrectionRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        correction = services.request_correction(
            _meta(request), self.get_object(), **data.validated_data
        )
        return Response(CorrectionSerializer(correction).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        parameters=[OpenApiParameter("term", int, required=True)],
        responses={(200, "text/csv"): str},
    )
    @action(detail=False, methods=["get"])
    def export(self, request):
        user = request.user
        if (
            rbac.scope_for(user, "results.view").none
            and not OfferingInstructor.objects.filter(user=user, role="teacher").exists()
        ):
            raise PermissionDenied()
        term = request.query_params.get("term")
        if not term or not term.isdigit():
            raise ValidationError({"term": [gettext("Choose a term.")]})
        rows = self.filter_queryset(self.get_queryset()).filter(term_id=int(term))
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="results-term-{term}.csv"'
        response.write("﻿")  # Excel opens UTF-8 CSV with Arabic correctly
        writer = csv.writer(response)
        writer.writerow(
            [
                "الرقم الجامعي",
                "الاسم",
                "رمز المقرر",
                "المقرر",
                "الدرجة",
                "التقدير",
                "النقاط",
                "الحالة",
                "منشور",
            ]
        )
        for r in rows.order_by("offering__course__code", "student_record__university_number"):
            writer.writerow(
                [
                    r.student_record.university_number,
                    r.student_record.full_name_ar,
                    r.offering.course.code,
                    r.offering.course.name_ar,
                    r.score if r.score is not None else "",
                    r.letter,
                    r.grade_points,
                    r.get_status_display(),
                    "نعم" if r.is_published else "لا",
                ]
            )
        record(
            _meta(request),
            "results.export",
            request.user,
            new={"term": int(term), "rows": rows.count()},
        )
        return response


@extend_schema(tags=["results"])
class CorrectionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Correction requests: the results officer asks, academic affairs decides."""

    serializer_class = CorrectionSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["status"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ResultCorrection.objects.none()
        user = self.request.user
        if not (rbac.can(user, "results.correct") or rbac.can(user, "results.approve")):
            raise PermissionDenied()
        return ResultCorrection.objects.select_related(
            "result__student_record",
            "result__offering__course",
            "result__term",
            "requested_by",
            "decided_by",
        )

    @extend_schema(request=CorrectionDecisionSerializer, responses=CorrectionSerializer)
    @action(detail=True, methods=["post"])
    def decide(self, request, public_id=None):
        data = CorrectionDecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        correction = services.decide_correction(
            _meta(request), self.get_object(), **data.validated_data
        )
        return Response(CorrectionSerializer(correction).data)


@extend_schema(tags=["results"])
class DisplaySettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        name = "results.settings" if request.method == "PATCH" else "results.view"
        if not rbac.can(request.user, name):
            raise PermissionDenied()

    @extend_schema(responses=DisplaySettingsSerializer)
    def get(self, request):
        return Response(DisplaySettingsSerializer(ResultDisplaySettings.load()).data)

    @extend_schema(request=DisplaySettingsSerializer, responses=DisplaySettingsSerializer)
    def patch(self, request):
        settings_ = ResultDisplaySettings.load()
        old = snapshot(settings_)
        data = DisplaySettingsSerializer(settings_, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        record(_meta(request), "results.settings", settings_, old=old, new=snapshot(settings_))
        return Response(data.data)


@extend_schema(tags=["results"])
class GradingScaleViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    serializer_class = GradingScaleSerializer
    queryset = GradingScale.objects.select_related("program")
    permission_classes = [IsAuthenticated, capability("results.view", "results.settings")]
    http_method_names = ["get", "post", "put", "head", "options"]

    def perform_create(self, serializer):
        scale = serializer.save()
        record(_meta(self.request), "results.scale_create", scale, new=snapshot(scale))

    def perform_update(self, serializer):
        old = snapshot(serializer.instance)
        scale = serializer.save()
        record(_meta(self.request), "results.scale_update", scale, old=old, new=snapshot(scale))


@extend_schema(tags=["results"])
class TermReleaseViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """Hide or show a term's published results to students (per program or all)."""

    serializer_class = TermReleaseSerializer
    queryset = TermResultRelease.objects.all()
    permission_classes = [IsAuthenticated, capability("results.view", "results.settings")]
    http_method_names = ["get", "post", "put", "head", "options"]
    filterset_fields = ["term"]

    def perform_create(self, serializer):
        release = serializer.save(released_by=self.request.user)
        record(_meta(self.request), "results.release", release, new=snapshot(release))

    def perform_update(self, serializer):
        release = serializer.save(released_by=self.request.user)
        record(_meta(self.request), "results.release", release, new=snapshot(release))


@extend_schema(tags=["me"])
class MyResultsView(APIView):
    """The signed-in student's published results with term and cumulative GPA."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MyResultsSerializer)
    def get(self, request):
        record_ = StudentRecord.objects.filter(user=request.user).first()
        if record_ is None:
            raise NotFound()
        built = MyResultsSerializer.build(services.student_view(record_))
        return Response(MyResultsSerializer(built).data)
