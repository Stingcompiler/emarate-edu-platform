"""Public catalogue for the website (docs/02 §6): departments, programs, pages, stats.

Read-only, anonymous, cached for a minute like the other /api/public views.
The Astro build reads these at build time; nothing personal is exposed.
"""

from __future__ import annotations

from collections import defaultdict

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from academic.models import Course, DepartmentMembership
from accounts.models import RoleAssignment
from accounts.rbac import Role
from content.models import Page, Status
from content.official import ORDER, public_path
from content.views import PUBLIC_CACHE, _PublicRead
from students.models import StudentRecord

from .models import Department, Program

S = serializers


class IntakeStateSerializer(S.Serializer):
    id = S.IntegerField()
    accepting = S.BooleanField()
    cycle = S.CharField()
    opens_at = S.DateTimeField()
    closes_at = S.DateTimeField()
    seats_left = S.IntegerField(allow_null=True)


class PublicProgramSerializer(S.Serializer):
    code = S.CharField()
    name_ar = S.CharField()
    name_en = S.CharField()
    degree = S.CharField()
    degree_label = S.CharField()
    department_code = S.CharField()
    department_name = S.CharField()
    department_name_en = S.CharField()
    duration_terms = S.IntegerField()
    levels_count = S.IntegerField()
    credit_hours = S.IntegerField()
    intake = IntakeStateSerializer(allow_null=True)


class PlanCourseSerializer(S.Serializer):
    code = S.CharField()
    name_ar = S.CharField()
    name_en = S.CharField()
    credit_hours = S.IntegerField()


class PlanLevelSerializer(S.Serializer):
    level = S.IntegerField()
    courses = PlanCourseSerializer(many=True)


class RequiredDocumentSerializer(S.Serializer):
    key = S.CharField()
    label = S.CharField()
    required = S.BooleanField()


class PublicProgramDetailSerializer(PublicProgramSerializer):
    description_ar = S.CharField()
    description_en = S.CharField()
    requirements_ar = S.CharField()
    required_documents = RequiredDocumentSerializer(many=True)
    plan = PlanLevelSerializer(many=True)


class PublicDepartmentSerializer(S.Serializer):
    id = S.IntegerField()
    code = S.CharField()
    name_ar = S.CharField()
    name_en = S.CharField()
    description = S.CharField()
    manager = S.CharField(allow_null=True)
    teachers = S.IntegerField()
    students = S.IntegerField()
    programs = PublicProgramSerializer(many=True)


class PublicPageRefSerializer(S.Serializer):
    slug = S.CharField()
    # Where the site serves it: official pages at their own path, the rest under p/.
    path = S.SerializerMethodField()
    title_ar = S.CharField()
    title_en = S.CharField()
    updated_at = S.DateTimeField()

    def get_path(self, page) -> str:
        return public_path(page.slug)


class PublicStatsSerializer(S.Serializer):
    students = S.IntegerField()
    teachers = S.IntegerField()
    programs = S.IntegerField()
    departments = S.IntegerField()


def _intakes(now) -> dict[int, dict]:
    """The latest intake of each program in an active cycle, with seats left."""
    from admissions.models import Application, ProgramIntake

    intakes = (
        ProgramIntake.objects.filter(cycle__is_active=True)
        .select_related("cycle")
        .annotate(
            taken=Count(
                "applications",
                filter=~Q(
                    applications__status__in=[
                        Application.Status.DRAFT,
                        Application.Status.WITHDRAWN,
                        Application.Status.REJECTED,
                        Application.Status.EXPIRED,
                    ]
                ),
            )
        )
        .order_by("program_id", "-cycle__opens_at")
    )
    out: dict[int, dict] = {}
    for intake in intakes:
        if intake.program_id in out:
            continue
        out[intake.program_id] = {
            "id": intake.id,
            "accepting": intake.accepting(now),
            "cycle": intake.cycle.name,
            "opens_at": intake.cycle.opens_at,
            "closes_at": intake.closes_at or intake.cycle.closes_at,
            "seats_left": max(0, intake.capacity - intake.taken) if intake.capacity else None,
            "requirements_ar": intake.requirements_ar,
            "required_documents": intake.required_documents,
        }
    return out


def _programs(queryset) -> list[dict]:
    now = timezone.now()
    intakes = _intakes(now)
    hours = dict(
        Course.objects.filter(program__in=queryset)
        .values("program_id")
        .annotate(total=Sum("credit_hours"))
        .order_by()
        .values_list("program_id", "total")
    )
    rows = []
    for p in queryset.select_related("department"):
        intake = intakes.get(p.id)
        rows.append(
            {
                "id": p.id,
                "code": p.code,
                "name_ar": p.name_ar,
                "name_en": p.name_en,
                "degree": p.degree,
                "degree_label": p.get_degree_display(),
                "department_code": p.department.code,
                "department_name": p.department.name_ar,
                "department_name_en": p.department.name_en,
                "duration_terms": p.duration_terms,
                "levels_count": p.levels_count,
                "credit_hours": hours.get(p.id) or 0,
                "intake": intake,
                "description_ar": p.description_ar,
                "description_en": p.description_en,
            }
        )
    return rows


def _active_programs():
    return Program.objects.filter(is_active=True, department__is_active=True)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicProgramsView(_PublicRead):
    @extend_schema(
        operation_id="public_programs_list", responses=PublicProgramSerializer(many=True)
    )
    def get(self, request):
        return Response(PublicProgramSerializer(_programs(_active_programs()), many=True).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicProgramView(_PublicRead):
    @extend_schema(operation_id="public_program_get", responses=PublicProgramDetailSerializer)
    def get(self, request, code):
        program = get_object_or_404(_active_programs(), code=code)
        row = _programs(Program.objects.filter(pk=program.pk))[0]
        levels: dict[int, list] = defaultdict(list)
        for course in Course.objects.filter(program=program).order_by(
            "default_level", "default_term_order", "code"
        ):
            levels[course.default_level].append(course)
        intake = row["intake"] or {}
        row.update(
            requirements_ar=intake.get("requirements_ar", ""),
            required_documents=intake.get("required_documents", []),
            plan=[
                {"level": level, "courses": courses} for level, courses in sorted(levels.items())
            ],
        )
        return Response(PublicProgramDetailSerializer(row).data)


def _departments(queryset) -> list[dict]:
    ids = list(queryset.values_list("id", flat=True))
    managers = dict(
        RoleAssignment.objects.filter(role=Role.DEPARTMENT_MANAGER, department_id__in=ids)
        .order_by("id")
        .values_list("department_id", "user__full_name_ar")
    )
    teachers = dict(
        DepartmentMembership.objects.filter(department_id__in=ids)
        .values("department_id")
        .annotate(n=Count("user", distinct=True))
        .order_by()
        .values_list("department_id", "n")
    )
    students = dict(
        StudentRecord.objects.filter(department_id__in=ids, status=StudentRecord.Status.ACTIVE)
        .values("department_id")
        .annotate(n=Count("id"))
        .order_by()
        .values_list("department_id", "n")
    )
    programs: dict[str, list] = defaultdict(list)
    for row in _programs(_active_programs().filter(department_id__in=ids)):
        programs[row["department_code"]].append(row)
    return [
        {
            "id": d.id,
            "code": d.code,
            "name_ar": d.name_ar,
            "name_en": d.name_en,
            "description": d.description,
            "manager": managers.get(d.id),
            "teachers": teachers.get(d.id, 0),
            "students": students.get(d.id, 0),
            "programs": programs.get(d.code, []),
        }
        for d in queryset
    ]


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicDepartmentsView(_PublicRead):
    @extend_schema(
        operation_id="public_departments_list", responses=PublicDepartmentSerializer(many=True)
    )
    def get(self, request):
        departments = Department.objects.filter(is_active=True).order_by("name_ar")
        return Response(PublicDepartmentSerializer(_departments(departments), many=True).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicDepartmentView(_PublicRead):
    @extend_schema(operation_id="public_department_get", responses=PublicDepartmentSerializer)
    def get(self, request, code):
        department = Department.objects.filter(is_active=True, code=code)
        if not department.exists():
            raise NotFound()
        return Response(PublicDepartmentSerializer(_departments(department)[0]).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicPagesView(_PublicRead):
    """Published pages (for the sitemap and the build's page list)."""

    @extend_schema(operation_id="public_pages_list", responses=PublicPageRefSerializer(many=True))
    def get(self, request):
        now = timezone.now()
        pages = (
            Page.objects.filter(status=Status.PUBLISHED)
            .filter(Q(publish_at__isnull=True) | Q(publish_at__lte=now))
            .order_by("slug")
        )
        # Official pages in their natural order (about, history, vision …), then the rest.
        pages = sorted(pages, key=lambda p: (ORDER.get(p.slug, len(ORDER)), p.slug))
        return Response(PublicPageRefSerializer(pages, many=True).data)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicStatsView(_PublicRead):
    """Headline numbers for the home page (counts only)."""

    @extend_schema(operation_id="public_stats_get", responses=PublicStatsSerializer)
    def get(self, request):
        return Response(
            PublicStatsSerializer(
                {
                    "students": StudentRecord.objects.filter(
                        status=StudentRecord.Status.ACTIVE
                    ).count(),
                    "teachers": DepartmentMembership.objects.values("user").distinct().count(),
                    "programs": _active_programs().count(),
                    "departments": Department.objects.filter(is_active=True).count(),
                }
            ).data
        )


class CalendarTermSerializer(S.Serializer):
    name_ar = S.CharField()
    name_en = S.CharField()
    starts_on = S.DateField()
    ends_on = S.DateField()
    is_current = S.BooleanField()


class CalendarAdmissionSerializer(S.Serializer):
    name = S.CharField()
    opens_at = S.DateTimeField()
    closes_at = S.DateTimeField()


class PublicCalendarSerializer(S.Serializer):
    terms = CalendarTermSerializer(many=True)
    admission = CalendarAdmissionSerializer(allow_null=True)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicCalendarView(_PublicRead):
    """The academic calendar: this year's and upcoming terms, and the admission window."""

    @extend_schema(operation_id="public_calendar", responses=PublicCalendarSerializer)
    def get(self, request):
        from academic.models import Term
        from admissions.models import AdmissionCycle

        today = timezone.localdate()
        current = Term.objects.filter(is_current=True).select_related("academic_year").first()
        since = current.academic_year.starts_on if current else today
        terms = Term.objects.filter(ends_on__gte=since).order_by("starts_on")
        cycle = AdmissionCycle.objects.filter(is_active=True).order_by("-opens_at").first()
        return Response(
            PublicCalendarSerializer(
                {
                    "terms": [
                        {
                            "name_ar": t.name_ar,
                            "name_en": t.name_en or t.name_ar,
                            "starts_on": t.starts_on,
                            "ends_on": t.ends_on,
                            "is_current": t.is_current,
                        }
                        for t in terms
                    ],
                    "admission": (
                        {
                            "name": cycle.name,
                            "opens_at": cycle.opens_at,
                            "closes_at": cycle.closes_at,
                        }
                        if cycle
                        else None
                    ),
                }
            ).data
        )
