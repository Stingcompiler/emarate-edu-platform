from decimal import Decimal

from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import RequestMeta

from . import access, services
from .models import Assignment, Lecture, LectureResource, Submission, SubmissionGrade
from .serializers import (
    AssignmentSerializer,
    GradeInputSerializer,
    GradeSerializer,
    LectureReorderSerializer,
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
            .annotate(views_total=Count("views"))
            # An aggregate drops Meta.ordering; keep the course's order for pagination.
            .order_by("offering", "order", "id")
        )

    def get_serializer_context(self):
        # View counts go to the course's staff only (see LectureSerializer.views_count).
        context = super().get_serializer_context()
        user = self.request.user if self.request else None
        if user is not None and user.is_authenticated:
            context["staff_offerings"] = set(
                Lecture.objects.filter(access.staff_offerings_q(user))
                .values_list("offering_id", flat=True)
                .distinct()
            )
        return context

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

    @extend_schema(request=LectureReorderSerializer, responses={204: None})
    @action(detail=False, methods=["post"])
    def reorder(self, request):
        """Renumber a course's lectures in the given order (every lecture, once)."""
        data = LectureReorderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.reorder_lectures(
            _meta(request), data.validated_data["offering"], data.validated_data["lectures"]
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"], url_path="view")
    def mark_viewed(self, request, public_id=None):
        """An enrolled student opened the lecture; for anyone else it changes nothing."""
        services.record_view(request.user, self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)

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
        mine = Submission.objects.filter(student_record__user=user).select_related("grade")
        return (
            Assignment.objects.filter(visible)
            .select_related("offering__course", "lecture")
            .prefetch_related(
                "link_fields", Prefetch("submissions", mine, to_attr="my_submissions")
            )
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


class GradebookCellSerializer(serializers.Serializer):
    score = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    status = serializers.ChoiceField(choices=["approved", "suggested", "submitted"])
    late = serializers.BooleanField()
    submission = serializers.UUIDField()


class GradebookStudentSerializer(serializers.Serializer):
    public_id = serializers.UUIDField()
    university_number = serializers.CharField()
    full_name_ar = serializers.CharField()
    cells = serializers.DictField(child=GradebookCellSerializer())
    total = serializers.DecimalField(max_digits=8, decimal_places=2)
    submitted = serializers.IntegerField()


class GradebookAssignmentSerializer(serializers.Serializer):
    public_id = serializers.UUIDField()
    title = serializers.CharField()
    max_grade = serializers.DecimalField(max_digits=6, decimal_places=2)
    due_at = serializers.DateTimeField()
    status = serializers.CharField()


class GradebookSerializer(serializers.Serializer):
    assignments = GradebookAssignmentSerializer(many=True)
    students = GradebookStudentSerializer(many=True)
    max_total = serializers.DecimalField(max_digits=8, decimal_places=2)


@extend_schema(tags=["learning"])
class GradebookView(APIView):
    """Roster + coursework grades of one offering, for its instructors and department staff.

    Fixed query count: roster, assignments and all submissions (with grades)
    are fetched once each and combined here.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=GradebookSerializer)
    def get(self, request, offering_id):
        from academic.models import CourseOffering, Enrollment

        offering = get_object_or_404(
            CourseOffering.objects.select_related("course"), pk=offering_id
        )
        if not access.for_offering(request.user, offering).view_all:
            raise NotFound()
        assignments = list(
            Assignment.objects.filter(offering=offering)
            .exclude(status=Assignment.Status.DRAFT)
            .order_by("due_at", "id")
        )
        roster = list(
            Enrollment.objects.filter(offering=offering, status=Enrollment.Status.ACTIVE)
            .select_related("student_record")
            .order_by("student_record__full_name_ar")
        )
        cells: dict[int, dict] = {e.student_record_id: {} for e in roster}
        submissions = Submission.objects.filter(assignment__in=assignments).select_related(
            "grade", "assignment"
        )
        for s in submissions:
            grade = getattr(s, "grade", None)
            status_ = "submitted" if grade is None else grade.status
            score = (
                grade.final_score
                if grade and grade.status == "approved"
                else (grade.score if grade else None)
            )
            cells.setdefault(s.student_record_id, {})[str(s.assignment.public_id)] = {
                "score": score,
                "status": status_,
                "late": s.is_late,
                "submission": s.public_id,
            }
        students = []
        for e in roster:
            mine = cells.get(e.student_record_id, {})
            total = sum(
                (c["score"] for c in mine.values() if c["status"] == "approved" and c["score"]),
                Decimal(0),
            )
            students.append(
                {
                    "public_id": e.student_record.public_id,
                    "university_number": e.student_record.university_number,
                    "full_name_ar": e.student_record.full_name_ar,
                    "cells": mine,
                    "total": total,
                    "submitted": len(mine),
                }
            )
        data = {
            "assignments": assignments,
            "students": students,
            "max_total": sum((a.max_grade for a in assignments), Decimal(0)),
        }
        return Response(GradebookSerializer(data).data)


class QueueAssignmentSerializer(serializers.Serializer):
    public_id = serializers.UUIDField()
    title = serializers.CharField()
    course_code = serializers.CharField(source="offering.course.code")
    course_name = serializers.CharField(source="offering.course.name_ar")
    max_grade = serializers.DecimalField(max_digits=6, decimal_places=2)
    due_at = serializers.DateTimeField()


class QueueGroupSerializer(serializers.Serializer):
    assignment = QueueAssignmentSerializer()
    submissions = SubmissionSerializer(many=True)


class QueueCountsSerializer(serializers.Serializer):
    pending = serializers.IntegerField()
    suggested = serializers.IntegerField()
    late = serializers.IntegerField()
    done = serializers.IntegerField()


class GradingQueueSerializer(serializers.Serializer):
    counts = QueueCountsSerializer()
    groups = QueueGroupSerializer(many=True)


@extend_schema(tags=["learning"])
class GradingQueueView(APIView):
    """Submissions of the courses the user teaches, oldest first (board TeacherGrading).

    One request instead of one per assignment; ``status`` filters the groups,
    counts always cover everything.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("status", str, enum=["pending", "suggested", "late", "done"])],
        responses=GradingQueueSerializer,
    )
    def get(self, request):
        wanted = request.query_params.get("status", "pending")
        from academic.models import OfferingInstructor

        # Only courses the user may grade: as teacher, or as a TA with delegated grading.
        gradable = OfferingInstructor.objects.filter(user=request.user).filter(
            Q(role=OfferingInstructor.Kind.TEACHER) | Q(offering__ta_can_grade=True)
        )
        rows = list(
            Submission.objects.filter(
                assignment__offering__in=gradable.values("offering"),
                assignment__status__in=[Assignment.Status.PUBLISHED, Assignment.Status.CLOSED],
            )
            .select_related(
                "assignment__offering__course", "student_record", "current_version", "grade"
            )
            .order_by("current_version__submitted_at", "first_submitted_at")
            .distinct()
        )

        def state(s) -> set[str]:
            grade = getattr(s, "grade", None)
            approved = grade is not None and grade.status == SubmissionGrade.Status.APPROVED
            tags = {"done"} if approved else {"pending"}
            if grade is not None and grade.status == SubmissionGrade.Status.SUGGESTED:
                tags.add("suggested")
            if s.is_late and not approved:
                tags.add("late")
            return tags

        counts = {"pending": 0, "suggested": 0, "late": 0, "done": 0}
        groups: dict[int, dict] = {}
        for s in rows:
            tags = state(s)
            for tag in tags:
                counts[tag] += 1
            if wanted in tags:
                group = groups.setdefault(
                    s.assignment_id, {"assignment": s.assignment, "submissions": []}
                )
                if len(group["submissions"]) < 200:
                    group["submissions"].append(s)
        data = {"counts": counts, "groups": list(groups.values())}
        return Response(GradingQueueSerializer(data).data)
