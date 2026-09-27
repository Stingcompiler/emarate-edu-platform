from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.services import RequestMeta

from . import access, services
from .models import Assignment, Lecture, LectureResource, Submission
from .serializers import (
    AssignmentSerializer,
    GradeInputSerializer,
    GradeSerializer,
    LectureSerializer,
    ResourceCreateSerializer,
    ResourceSerializer,
    SubmissionSerializer,
    SubmitSerializer,
)


def _meta(request) -> RequestMeta:
    return RequestMeta.from_request(request)


@extend_schema(tags=["learning"])
class LectureViewSet(viewsets.ModelViewSet):
    """Lectures of the caller's courses. Students see published lectures only."""

    serializer_class = LectureSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["offering", "is_published", "type"]
    search_fields = ["title_ar", "title_en"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Lecture.objects.none()
        user = self.request.user
        visible = access.staff_offerings_q(user) | (
            access.student_offerings_q(user) & Q(is_published=True)
        )
        return (
            Lecture.objects.filter(visible)
            .select_related("offering__course")
            .prefetch_related("resources__file", "resources__video")
        )

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        lecture = services.create_lecture(_meta(request), **data.validated_data)
        return Response(self.get_serializer(lecture).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        lecture = self.get_object()
        data = self.get_serializer(lecture, data=request.data, partial=kwargs.get("partial", False))
        data.is_valid(raise_exception=True)
        values = {k: v for k, v in data.validated_data.items() if k != "offering"}
        lecture = services.update_lecture(_meta(request), lecture, **values)
        return Response(self.get_serializer(lecture).data)

    def perform_destroy(self, instance):
        services.delete_lecture(_meta(self.request), instance)

    @extend_schema(request=None, responses=LectureSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        lecture = services.set_lecture_published(_meta(request), self.get_object(), True)
        return Response(self.get_serializer(lecture).data)

    @extend_schema(request=None, responses=LectureSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, public_id=None):
        lecture = services.set_lecture_published(_meta(request), self.get_object(), False)
        return Response(self.get_serializer(lecture).data)

    @extend_schema(request=ResourceCreateSerializer, responses={201: ResourceSerializer})
    @action(detail=True, methods=["post"], url_path="resources")
    def add_resource(self, request, public_id=None):
        lecture = self.get_object()
        data = ResourceCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        resource = services.add_resource(_meta(request), lecture, **data.validated_data)
        return Response(ResourceSerializer(resource).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"resources/(?P<resource_id>\d+)")
    def remove_resource(self, request, public_id=None, resource_id=None):
        resource = get_object_or_404(LectureResource, pk=resource_id, lecture=self.get_object())
        services.remove_resource(_meta(request), resource)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["learning"])
class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["offering", "status", "lecture"]
    search_fields = ["title"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Assignment.objects.none()
        user = self.request.user
        visible = access.staff_offerings_q(user) | (
            access.student_offerings_q(user) & ~Q(status=Assignment.Status.DRAFT)
        )
        return (
            Assignment.objects.filter(visible)
            .select_related("offering__course", "lecture")
            .prefetch_related("link_fields")
        )

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        link_fields = values.pop("link_fields", None)
        assignment = services.create_assignment(_meta(request), link_fields=link_fields, **values)
        return Response(self.get_serializer(assignment).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        assignment = self.get_object()
        data = self.get_serializer(
            assignment, data=request.data, partial=kwargs.get("partial", False)
        )
        data.is_valid(raise_exception=True)
        values = {k: v for k, v in data.validated_data.items() if k != "offering"}
        link_fields = values.pop("link_fields", None)
        assignment = services.update_assignment(
            _meta(request), assignment, link_fields=link_fields, **values
        )
        return Response(self.get_serializer(assignment).data)

    def perform_destroy(self, instance):
        services.delete_assignment(_meta(self.request), instance)

    @extend_schema(request=None, responses=AssignmentSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        assignment = services.set_assignment_status(
            _meta(request), self.get_object(), Assignment.Status.PUBLISHED
        )
        return Response(self.get_serializer(assignment).data)

    @extend_schema(request=None, responses=AssignmentSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, public_id=None):
        assignment = services.set_assignment_status(
            _meta(request), self.get_object(), Assignment.Status.CLOSED
        )
        return Response(self.get_serializer(assignment).data)

    @extend_schema(request=SubmitSerializer, responses={201: SubmissionSerializer})
    @action(detail=True, methods=["post"])
    def submit(self, request, public_id=None):
        data = SubmitSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        submission = services.submit(_meta(request), self.get_object(), **data.validated_data)
        return Response(SubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses=SubmissionSerializer)
    @action(detail=True, methods=["get"], url_path="my-submission")
    def my_submission(self, request, public_id=None):
        submission = (
            Submission.objects.filter(
                assignment=self.get_object(), student_record__user=request.user
            )
            .select_related("current_version", "grade", "student_record")
            .first()
        )
        if submission is None:
            raise NotFound()
        return Response(SubmissionSerializer(submission).data)

    @extend_schema(responses=SubmissionSerializer(many=True))
    @action(detail=True, methods=["get"])
    def submissions(self, request, public_id=None):
        assignment = self.get_object()
        services.require(request.user, assignment.offering, "view_all")
        rows = assignment.submissions.select_related(
            "student_record", "current_version", "grade", "assignment"
        )
        page = self.paginate_queryset(rows)
        data = SubmissionSerializer(page, many=True, context={"staff": True}).data
        return self.get_paginated_response(data)


@extend_schema(tags=["learning"])
class SubmissionViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """A student's submission: staff of the course or the student themself."""

    serializer_class = SubmissionSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Submission.objects.none()
        user = self.request.user
        visible = access.staff_offerings_q(user, "assignment__offering") | Q(
            student_record__user=user
        )
        return Submission.objects.filter(visible).select_related(
            "assignment__offering__course", "student_record", "current_version", "grade"
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        obj = getattr(self, "_object", None)
        if obj is not None:
            context["staff"] = access.for_offering(
                self.request.user, obj.assignment.offering
            ).view_all
        return context

    def get_object(self):
        self._object = super().get_object()
        return self._object

    @extend_schema(request=GradeInputSerializer, responses=GradeSerializer)
    @action(detail=True, methods=["put"])
    def grade(self, request, public_id=None):
        data = GradeInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        result = services.grade(_meta(request), self.get_object(), **data.validated_data)
        return Response(GradeSerializer(result).data)

    @extend_schema(request=None, responses=GradeSerializer)
    @action(detail=True, methods=["post"], url_path="grade/approve")
    def approve(self, request, public_id=None):
        result = services.approve_grade(_meta(request), self.get_object())
        return Response(GradeSerializer(result).data)
