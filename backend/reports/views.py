"""Report endpoints (docs/02 §4.14). Reads are aggregates computed per request;
exports are frozen as ReportSnapshot and printed to PDF by the portal."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academic.models import AcademicYear, CourseOffering, OfferingInstructor, Term
from accounts import rbac
from audit.services import RequestMeta
from core.permissions import capability
from organization.models import Department

from . import metrics, services
from .models import ReportSnapshot
from .serializers import (
    AdmissionsReportSerializer,
    AffairsReportSerializer,
    DepartmentReportSerializer,
    ReportSnapshotCreateSerializer,
    ReportSnapshotListSerializer,
    ReportSnapshotSerializer,
    TeacherProfileSerializer,
    TeachersReportSerializer,
    TranscriptSerializer,
)

TERM = OpenApiParameter("term", int, description="Defaults to the current term.")
DEPARTMENT = OpenApiParameter("department", int)


def _int(value, name: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({name: [gettext("Expected a number.")]}) from None


def _term(value) -> Term:
    term_id = _int(value, "term")
    term = Term.objects.filter(pk=term_id).first() if term_id else metrics.current_term()
    if term is None:
        raise NotFound(gettext("No term."))
    return term


def _departments(scope: rbac.Scope, value) -> list[int]:
    """Departments to report on: the one asked for (if in scope) or all in scope."""
    department_id = _int(value, "department")
    if department_id is not None:
        if not scope.allows(department_id):
            raise PermissionDenied()
        return [department_id]
    if scope.everything:
        return list(Department.objects.values_list("id", flat=True))
    return sorted(scope.departments)


def _term_ref(term: Term) -> dict:
    return {"id": term.id, "name": term.name_ar, "week": metrics.weeks_elapsed(term)}


# ─── Department ───────────────────────────────────────────────────────────


def build_department(user, term_value, department_value) -> tuple[dict, Term, list[int]]:
    scope = rbac.scope_for(user, "reports.department")
    term = _term(term_value)
    dept_ids = _departments(scope, department_value)
    return metrics.department_report(term, dept_ids), term, dept_ids


class DepartmentReportView(APIView):
    permission_classes = [capability("reports.department")]

    @extend_schema(parameters=[TERM, DEPARTMENT], responses=DepartmentReportSerializer)
    def get(self, request):
        data, _, _ = build_department(
            request.user, request.query_params.get("term"), request.query_params.get("department")
        )
        return Response(DepartmentReportSerializer(data).data)


# ─── Teachers ─────────────────────────────────────────────────────────────


def build_teachers(user, term_value, department_value, kind) -> tuple[dict, Term]:
    scope = rbac.scope_for(user, "reports.teachers")
    term = _term(term_value)
    department_id = _int(department_value, "department")
    if department_id is not None and not scope.allows(department_id):
        raise PermissionDenied()
    if kind not in (None, "", "teacher", "ta"):
        raise ValidationError({"kind": [gettext("teacher or ta.")]})
    data = metrics.teachers_report(term, scope, department_id=department_id, kind=kind or None)
    return data, term


class TeachersReportView(APIView):
    permission_classes = [capability("reports.teachers")]

    @extend_schema(
        operation_id="reports_teachers_list",
        parameters=[TERM, DEPARTMENT, OpenApiParameter("kind", str, enum=["teacher", "ta"])],
        responses=TeachersReportSerializer,
    )
    def get(self, request):
        params = request.query_params
        data, _ = build_teachers(
            request.user, params.get("term"), params.get("department"), params.get("kind")
        )
        return Response(TeachersReportSerializer(data).data)


class TeacherProfileView(APIView):
    """One teacher's indicators, courses and (for HR roles) the notices in their file."""

    permission_classes = [capability("reports.teachers")]

    @extend_schema(
        operation_id="reports_teacher_profile",
        parameters=[TERM],
        responses=TeacherProfileSerializer,
    )
    def get(self, request, public_id):
        user = request.user
        scope = rbac.scope_for(user, "reports.teachers")
        teacher = get_object_or_404(get_user_model(), public_id=public_id)
        term = _term(request.query_params.get("term"))
        rows = metrics.teacher_rows(term, scope, user_ids={teacher.id})
        if not rows:
            raise NotFound()
        before = metrics.previous_term(term)
        previous = metrics.teacher_rows(before, scope, user_ids={teacher.id}) if before else []
        offerings = scope.filter(
            CourseOffering.objects.filter(term=term, instructors__user=teacher),
            "course__department_id",
        ).select_related("course")
        stats = metrics._offering_stats([o.id for o in offerings], timezone.now())
        roles = dict(
            OfferingInstructor.objects.filter(offering__in=offerings, user=teacher).values_list(
                "offering_id", "role"
            )
        )
        planned = metrics.weeks_elapsed(term) * metrics.thresholds()["lectures_per_week"]
        notices = None
        if rbac.can(user, "hr.view"):
            from notifications.models import HRNotice

            notices = HRNotice.objects.filter(teacher=teacher).select_related(
                "teacher", "sent_by", "term"
            )
        data = {
            "term": _term_ref(term),
            "thresholds": metrics.thresholds(),
            "row": rows[0],
            "previous": previous[0] if previous else None,
            "offerings": [
                {
                    "public_id": o.public_id,
                    "code": o.course.code,
                    "name": o.course.name_ar,
                    "role": roles.get(o.id, "teacher"),
                    "students": stats[o.id]["students"],
                    "lectures": stats[o.id]["lectures"],
                    "planned": planned,
                    "ungraded": stats[o.id]["ungraded"],
                }
                for o in offerings
            ],
            "notices": notices,
        }
        return Response(TeacherProfileSerializer(data).data)


# ─── Admissions / student affairs ─────────────────────────────────────────


def build_admissions(user, cycle_value, department_value):
    from admissions.models import AdmissionCycle

    cycle_id = _int(cycle_value, "cycle")
    cycles = AdmissionCycle.objects.order_by("-opens_at")
    cycle = cycles.filter(pk=cycle_id).first() if cycle_id else cycles.first()
    if cycle is None:
        raise NotFound(gettext("No admission cycle."))
    department_id = _int(department_value, "department")
    return metrics.admissions_report(cycle, department_id=department_id), cycle


class AdmissionsReportView(APIView):
    permission_classes = [capability("reports.admissions")]

    @extend_schema(
        parameters=[OpenApiParameter("cycle", int), DEPARTMENT],
        responses=AdmissionsReportSerializer,
    )
    def get(self, request):
        data, _ = build_admissions(
            request.user, request.query_params.get("cycle"), request.query_params.get("department")
        )
        return Response(AdmissionsReportSerializer(data).data)


def build_affairs(user, year_value, department_value):
    year_id = _int(year_value, "year")
    years = AcademicYear.objects.order_by("-starts_on")
    year = (
        years.filter(pk=year_id).first()
        if year_id
        else years.filter(is_current=True).first() or years.first()
    )
    if year is None:
        raise NotFound(gettext("No academic year."))
    department_id = _int(department_value, "department")
    return metrics.affairs_report(year, department_id=department_id), year


class AffairsReportView(APIView):
    permission_classes = [capability("reports.affairs")]

    @extend_schema(
        parameters=[OpenApiParameter("year", int), DEPARTMENT],
        responses=AffairsReportSerializer,
    )
    def get(self, request):
        data, _ = build_affairs(
            request.user, request.query_params.get("year"), request.query_params.get("department")
        )
        return Response(AffairsReportSerializer(data).data)


# ─── Snapshots ────────────────────────────────────────────────────────────

SNAPSHOT_SERIALIZERS = {
    ReportSnapshot.Kind.DEPARTMENT: DepartmentReportSerializer,
    ReportSnapshot.Kind.TEACHERS: TeachersReportSerializer,
    ReportSnapshot.Kind.ADMISSIONS: AdmissionsReportSerializer,
    ReportSnapshot.Kind.AFFAIRS: AffairsReportSerializer,
}


class ReportSnapshotViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Frozen exports. The server computes the data; they are never edited or deleted."""

    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["kind"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ReportSnapshot.objects.none()
        return services.visible_snapshots(self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return ReportSnapshotListSerializer
        if self.action == "create":
            return ReportSnapshotCreateSerializer
        return ReportSnapshotSerializer

    def list(self, request, *args, **kwargs):
        if not any(rbac.can(request.user, c) for c in services.SNAPSHOT_CAPABILITY.values()):
            raise PermissionDenied()
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=ReportSnapshotCreateSerializer, responses={201: ReportSnapshotSerializer}
    )
    def create(self, request, *args, **kwargs):
        body = ReportSnapshotCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        v = body.validated_data
        kind = v["kind"]
        user = request.user
        if not rbac.can(user, services.SNAPSHOT_CAPABILITY[kind]):
            raise PermissionDenied()
        links: dict = {
            "params": {k: v[k] for k in ("term", "department", "cycle", "year") if k in v}
        }
        K = ReportSnapshot.Kind
        if kind == K.DEPARTMENT:
            data, term, dept_ids = build_department(user, v.get("term"), v.get("department"))
            links["term"] = term
            if len(dept_ids) == 1:
                links["department"] = Department.objects.get(pk=dept_ids[0])
            elif not rbac.scope_for(user, "reports.department").everything:
                raise ValidationError({"department": [gettext("Choose a department.")]})
            title = f"تقرير القسم — {'، '.join(data['departments'][:3])} — {term.name_ar}"
        elif kind == K.TEACHERS:
            scope = rbac.scope_for(user, "reports.teachers")
            if not scope.everything and v.get("department") is None:
                raise ValidationError({"department": [gettext("Choose a department.")]})
            data, term = build_teachers(user, v.get("term"), v.get("department"), None)
            links["term"] = term
            if v.get("department") is not None:
                links["department"] = Department.objects.get(pk=v["department"])
            title = f"تقرير أداء هيئة التدريس — {term.name_ar}"
        elif kind == K.ADMISSIONS:
            data, cycle = build_admissions(user, v.get("cycle"), v.get("department"))
            title = f"تقرير القبول والتسجيل — {cycle.name}"
        else:
            data, year = build_affairs(user, v.get("year"), v.get("department"))
            title = f"تقرير شؤون الطلاب — {year.name}"
        payload = SNAPSHOT_SERIALIZERS[kind](data).data
        snapshot = services.create_snapshot(
            RequestMeta.from_request(request),
            kind=kind,
            title=title,
            data=payload,
            notes=v.get("notes", ""),
            **links,
        )
        return Response(ReportSnapshotSerializer(snapshot).data, status=201)


# ─── Transcript ───────────────────────────────────────────────────────────


class TranscriptView(APIView):
    """Official academic record for results staff (printed to PDF by the portal)."""

    permission_classes = [capability("results.view")]

    @extend_schema(responses=TranscriptSerializer)
    def get(self, request, university_number):
        from results import services as results
        from students.models import StudentRecord

        record_ = get_object_or_404(
            StudentRecord.objects.select_related("program", "department"),
            university_number=university_number,
        )
        if not rbac.can(request.user, "results.view", record_.department_id):
            raise NotFound()
        view = results.transcript(record_)
        data = {
            "university_number": record_.university_number,
            "full_name_ar": record_.full_name_ar,
            "full_name_en": record_.full_name_en,
            "program": record_.program.name_ar,
            "department": record_.department.name_ar,
            "level": record_.level,
            "status": record_.get_status_display(),
            "cumulative_gpa": view["cumulative_gpa"],
            "earned_hours": view["earned_hours"],
            "issued_at": timezone.now(),
            "terms": [
                {
                    "term": t["term"].name_ar,
                    "credit_hours": t["credit_hours"],
                    "gpa": t["gpa"],
                    "results": [
                        {
                            "course_code": r.offering.course.code,
                            "course_name": r.offering.course.name_ar,
                            "credit_hours": r.offering.course.credit_hours,
                            "score": r.score,
                            "letter": r.letter,
                            "grade_points": r.grade_points,
                            "status": r.get_status_display(),
                        }
                        for r in t["rows"]
                    ],
                }
                for t in view["terms"]
            ],
        }
        return Response(TranscriptSerializer(data).data)
