from django.db.models import Count, Prefetch, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import rbac
from audit.services import RequestMeta
from core.permissions import capability
from core.viewsets import ScopedModelViewSet
from organization.models import Department
from students.models import StudentRecord

from . import services
from .models import (
    AcademicYear,
    Course,
    CourseOffering,
    DepartmentMembership,
    Enrollment,
    OfferingInstructor,
    Term,
)
from .serializers import (
    AcademicYearSerializer,
    BulkEnrollResultSerializer,
    BulkEnrollSerializer,
    CourseSerializer,
    EnrollmentCreateSerializer,
    EnrollmentSerializer,
    InstructorAddSerializer,
    InstructorSerializer,
    MembershipAddSerializer,
    MembershipSerializer,
    MyCourseSerializer,
    OfferingSerializer,
    TermSerializer,
)

_INSTRUCTORS = Prefetch("instructors", queryset=OfferingInstructor.objects.select_related("user"))


class AcademicYearViewSet(ScopedModelViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    read_capability = "structure.view"
    write_capability = "structure.manage"
    department_lookup = None
    audit_name = "academic_year"

    def department_of(self, obj):
        return None


class TermViewSet(ScopedModelViewSet):
    queryset = Term.objects.select_related("academic_year")
    serializer_class = TermSerializer
    read_capability = "structure.view"
    write_capability = "structure.manage"
    department_lookup = None
    audit_name = "term"
    filterset_fields = ["academic_year", "is_current", "status"]

    def department_of(self, obj):
        return None


class CourseViewSet(ScopedModelViewSet):
    """Course catalogue. Department roles see and edit their own department."""

    queryset = Course.objects.select_related("department", "program")
    serializer_class = CourseSerializer
    read_capability = "courses.view"
    write_capability = "courses.manage"
    delete_capability = "courses.delete"
    audit_name = "course"
    filterset_fields = ["department", "program", "default_level", "is_active"]
    search_fields = ["code", "name_ar", "name_en"]
    ordering_fields = ["code", "default_level"]


class OfferingViewSet(ScopedModelViewSet):
    """A course taught in a term (section), with its instructors."""

    serializer_class = OfferingSerializer
    read_capability = "courses.view"
    write_capability = "courses.manage"
    delete_capability = "courses.delete"
    department_lookup = "course__department"
    audit_name = "offering"
    filterset_fields = ["term", "course", "course__department", "status"]
    search_fields = ["course__code", "course__name_ar"]

    def get_queryset(self):
        self.queryset = (
            CourseOffering.objects.select_related("course", "term")
            .prefetch_related(_INSTRUCTORS)
            .annotate(enrolled_count=Count("enrollments", filter=Q(enrollments__status="active")))
            # GROUP BY drops the model's default ordering; restate it for pagination.
            .order_by("course__code", "section", "id")
        )
        return super().get_queryset()

    def department_of(self, obj):
        return obj.course.department_id

    def department_of_data(self, data):
        course = data.get("course")
        return course.department_id if course is not None else None

    @extend_schema(request=InstructorAddSerializer, responses={201: InstructorSerializer})
    @action(detail=True, methods=["post"], url_path="instructors")
    def add_instructor(self, request, pk=None):
        offering = self.get_object()
        data = InstructorAddSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        instructor = services.add_instructor(
            RequestMeta.from_request(request),
            offering,
            data.validated_data["user"],
            data.validated_data["role"],
        )
        return Response(InstructorSerializer(instructor).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"instructors/(?P<instructor_id>\d+)")
    def remove_instructor(self, request, pk=None, instructor_id=None):
        offering = self.get_object()
        instructor = get_object_or_404(OfferingInstructor, pk=instructor_id, offering=offering)
        services.remove_instructor(RequestMeta.from_request(request), instructor)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_permissions(self):
        # Instructor removal is a delete (supervisors cannot); adding is a write.
        if self.action == "remove_instructor":
            return [IsAuthenticated(), capability("courses.view", "courses.delete")()]
        return super().get_permissions()


class DepartmentMembersView(APIView):
    """Teachers and TAs belonging to a department (docs/02 D13)."""

    permission_classes = [
        IsAuthenticated,
        capability("courses.view", "membership.manage", "membership.remove"),
    ]

    def _department(self, request, department_id):
        department = get_object_or_404(Department, pk=department_id)
        name = "courses.view" if request.method == "GET" else "membership.manage"
        if not rbac.can(request.user, name, department.pk):
            # Hide departments outside the caller's scope entirely.
            raise Http404
        return department

    @extend_schema(responses=MembershipSerializer(many=True))
    def get(self, request, department_id):
        department = self._department(request, department_id)
        rows = DepartmentMembership.objects.filter(department=department).select_related("user")
        return Response(MembershipSerializer(rows, many=True).data)

    @extend_schema(request=MembershipAddSerializer, responses={201: MembershipSerializer})
    def post(self, request, department_id):
        department = self._department(request, department_id)
        data = MembershipAddSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        membership = services.add_member(
            RequestMeta.from_request(request),
            department,
            data.validated_data["user"],
            data.validated_data["kind"],
        )
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class DepartmentMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, capability("courses.view", "membership.remove")]

    @extend_schema(request=None, responses={204: None})
    def delete(self, request, department_id, membership_id):
        membership = get_object_or_404(
            DepartmentMembership, pk=membership_id, department_id=department_id
        )
        if not rbac.can(request.user, "courses.view", membership.department_id):
            raise Http404
        services.remove_member(RequestMeta.from_request(request), membership)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnrollmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Enrollment is created (single or bulk) and dropped — never deleted."""

    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated, capability("enrollment.manage")]
    filterset_fields = ["offering", "status", "offering__term", "student_record__level"]
    search_fields = ["student_record__university_number", "student_record__full_name_ar"]

    def get_queryset(self):
        queryset = Enrollment.objects.select_related(
            "student_record", "offering__course", "offering__term"
        ).prefetch_related(
            Prefetch(
                "offering__instructors", queryset=OfferingInstructor.objects.select_related("user")
            )
        )
        scope = rbac.scope_for(self.request.user, "enrollment.manage")
        return scope.filter(queryset, "offering__course__department")

    @extend_schema(request=EnrollmentCreateSerializer, responses={201: EnrollmentSerializer})
    def create(self, request):
        data = EnrollmentCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        enrollment = services.enroll(
            RequestMeta.from_request(request),
            data.validated_data["offering"],
            data.validated_data["student_record"],
        )
        return Response(EnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=BulkEnrollSerializer, responses={200: BulkEnrollResultSerializer})
    @action(detail=False, methods=["post"])
    def bulk(self, request):
        data = BulkEnrollSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        summary = services.bulk_enroll(
            RequestMeta.from_request(request),
            data.validated_data["term"],
            data.validated_data["program"],
            data.validated_data["level"],
        )
        return Response(summary)

    @extend_schema(request=None, responses={200: EnrollmentSerializer})
    @action(detail=True, methods=["post"])
    def drop(self, request, pk=None):
        enrollment = services.drop(RequestMeta.from_request(request), self.get_object())
        return Response(EnrollmentSerializer(enrollment).data)


class MyCoursesView(APIView):
    """Current-term courses for the signed-in student (enrolled) or teacher/TA (teaching)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MyCourseSerializer(many=True), tags=["me"])
    def get(self, request):
        term = Term.current()
        if term is None:
            return Response([])
        base = CourseOffering.objects.filter(term=term).select_related("course", "term")
        base = base.prefetch_related(_INSTRUCTORS)
        courses = []
        record_ = StudentRecord.objects.filter(user=request.user).first()
        if record_ is not None:
            for offering in base.filter(
                enrollments__student_record=record_, enrollments__status="active"
            ):
                offering.my_role = "student"
                courses.append(offering)
        teaching = {
            row.offering_id: row.role
            for row in OfferingInstructor.objects.filter(user=request.user, offering__term=term)
        }
        for offering in base.filter(pk__in=teaching):
            offering.my_role = teaching[offering.pk]
            courses.append(offering)
        return Response(MyCourseSerializer(courses, many=True).data)
