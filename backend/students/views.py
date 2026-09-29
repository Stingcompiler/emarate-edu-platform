from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts import rbac
from audit.services import RequestMeta
from core.errors import Conflict
from core.permissions import capability

from . import importer, services
from .models import StudentImportBatch, StudentRecord
from .serializers import (
    ImportBatchSerializer,
    ImportRowSerializer,
    ImportUploadSerializer,
    StudentRecordSerializer,
    StudentRecordWriteSerializer,
)


class StudentRecordViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.ReadOnlyModelViewSet,
):
    """Official student records, filtered to the caller's departments.

    Department managers and supervisors add and correct their department's records;
    managers also delete a record added by mistake (owner 2026-09-29).
    """

    serializer_class = StudentRecordSerializer
    permission_classes = [
        IsAuthenticated,
        capability("students.view", "students.manage", "students.delete"),
    ]
    lookup_field = "public_id"
    filterset_fields = ["program", "department", "level", "status"]
    search_fields = ["university_number", "full_name_ar", "full_name_en", "email"]
    ordering_fields = ["university_number", "level", "full_name_ar"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = StudentRecord.objects.select_related("program", "department")
        return rbac.scope_for(self.request.user, "students.view").filter(queryset, "department")

    def get_serializer_class(self):
        if self.request.method in ("POST", "PATCH"):
            return StudentRecordWriteSerializer
        return StudentRecordSerializer

    @extend_schema(request=StudentRecordWriteSerializer, responses={201: StudentRecordSerializer})
    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        obj = services.create_record(RequestMeta.from_request(request), **data.validated_data)
        return Response(StudentRecordSerializer(obj).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=StudentRecordWriteSerializer, responses=StudentRecordSerializer)
    def partial_update(self, request, *args, **kwargs):
        obj = self.get_object()
        data = self.get_serializer(obj, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        obj = services.update_record(RequestMeta.from_request(request), obj, **data.validated_data)
        return Response(StudentRecordSerializer(obj).data)

    def perform_destroy(self, instance):
        services.delete_record(RequestMeta.from_request(self.request), instance)


class StudentImportViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Validate → preview → commit the college's student file (Excel or CSV)."""

    serializer_class = ImportBatchSerializer
    permission_classes = [IsAuthenticated, capability("students.import")]
    lookup_field = "public_id"
    queryset = StudentImportBatch.objects.select_related("uploaded_by")
    # Parsers are chosen before the action is known, so declare both here.
    parser_classes = [MultiPartParser, JSONParser]

    @extend_schema(
        request={"multipart/form-data": ImportUploadSerializer},
        responses={201: ImportBatchSerializer},
    )
    def create(self, request):
        upload = ImportUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        file = upload.validated_data["file"]
        try:
            batch = importer.validate_file(RequestMeta.from_request(request), file.name, file)
        except importer.ImportFileError as error:
            raise ValidationError({"file": [str(error)]}) from None
        except UnicodeDecodeError:
            raise ValidationError({"file": [gettext("Save the CSV as UTF-8.")]}) from None
        return Response(ImportBatchSerializer(batch).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses=ImportRowSerializer(many=True))
    @action(detail=True, methods=["get"])
    def rows(self, request, public_id=None):
        batch = self.get_object()
        rows = batch.rows.all()
        wanted = request.query_params.get("action")
        if wanted:
            rows = rows.filter(action=wanted)
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(ImportRowSerializer(page, many=True).data)

    @extend_schema(request=None, responses={200: ImportBatchSerializer})
    @action(detail=True, methods=["post"])
    def commit(self, request, public_id=None):
        try:
            batch = importer.commit(RequestMeta.from_request(request), self.get_object())
        except ValueError as error:
            raise Conflict(str(error), code="batch_closed") from None
        return Response(ImportBatchSerializer(batch).data)

    @extend_schema(request=None, responses={200: ImportBatchSerializer})
    @action(detail=True, methods=["post"])
    def reject(self, request, public_id=None):
        try:
            batch = importer.reject(RequestMeta.from_request(request), self.get_object())
        except ValueError as error:
            raise Conflict(str(error), code="batch_closed") from None
        return Response(ImportBatchSerializer(batch).data)
