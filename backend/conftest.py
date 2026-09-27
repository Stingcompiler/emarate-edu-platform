"""Shared fixtures: a small college with two departments and one user per role."""

from __future__ import annotations

import re
from datetime import date

import pytest
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from academic.models import AcademicYear, Course, CourseOffering, Term
from accounts.models import RoleAssignment, User
from accounts.rbac import DEPARTMENT_SCOPED_ROLES, Role
from organization.models import College, Department, Program
from students.models import StudentRecord

PASSWORD = "Str0ng-pass-2026"


@pytest.fixture(autouse=True)
def _clean_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def college(db):
    return College.objects.create(code="ECST", name_ar="كلية الإمارات للعلوم والتكنولوجيا")


@pytest.fixture
def it_dept(college):
    return Department.objects.create(college=college, code="IT", name_ar="تقانة المعلومات")


@pytest.fixture
def ba_dept(college):
    return Department.objects.create(college=college, code="BA", name_ar="إدارة الأعمال")


@pytest.fixture
def it_program(it_dept):
    return Program.objects.create(
        department=it_dept,
        code="BIT",
        name_ar="بكالوريوس تقانة المعلومات",
        degree=Program.Degree.BACHELOR,
        levels_count=4,
        duration_terms=8,
    )


@pytest.fixture
def ba_program(ba_dept):
    return Program.objects.create(
        department=ba_dept,
        code="BBA",
        name_ar="بكالوريوس إدارة الأعمال",
        degree=Program.Degree.BACHELOR,
        levels_count=4,
        duration_terms=8,
    )


@pytest.fixture
def term(db):
    year = AcademicYear.objects.create(
        name="2026/2027", starts_on=date(2026, 9, 1), ends_on=date(2027, 7, 31), is_current=True
    )
    return Term.objects.create(
        academic_year=year,
        order=1,
        name_ar="الفصل الأول",
        starts_on=date(2026, 9, 1),
        ends_on=date(2027, 1, 31),
        is_current=True,
        status=Term.Status.ACTIVE,
    )


@pytest.fixture
def it_course(it_dept, it_program):
    return Course.objects.create(
        department=it_dept, program=it_program, code="IT101", name_ar="مقدمة في البرمجة"
    )


@pytest.fixture
def ba_course(ba_dept, ba_program):
    return Course.objects.create(
        department=ba_dept, program=ba_program, code="BA101", name_ar="مبادئ الإدارة"
    )


@pytest.fixture
def it_offering(it_course, term):
    return CourseOffering.objects.create(course=it_course, term=term)


@pytest.fixture
def ba_offering(ba_course, term):
    return CourseOffering.objects.create(course=ba_course, term=term)


_counter = iter(range(1, 1_000_000))


@pytest.fixture
def make_user(db):
    def make(*roles: Role, department: Department | None = None, **extra) -> User:
        n = next(_counter)
        user = User.objects.create_user(
            email=extra.pop("email", f"user{n}@ecst.test"),
            password=extra.pop("password", PASSWORD),
            full_name_ar=extra.pop("full_name_ar", f"مستخدم {n}"),
            **extra,
        )
        for role in roles:
            RoleAssignment.objects.create(
                user=user,
                role=role,
                department=department if role in DEPARTMENT_SCOPED_ROLES else None,
            )
        return user

    return make


@pytest.fixture
def users(make_user, it_dept):
    """One user per role; department-scoped roles belong to IT."""
    return {role: make_user(role, department=it_dept) for role in Role}


@pytest.fixture
def make_student(db):
    def make(program: Program, number: str, name: str = "أحمد محمد علي", **extra):
        return StudentRecord.objects.create(
            program=program,
            university_number=number,
            full_name_ar=name,
            level=extra.pop("level", 1),
            **extra,
        )

    return make


@pytest.fixture
def api():
    def client(user: User | None = None) -> APIClient:
        c = APIClient()
        if user is not None:
            c.force_authenticate(user)
        return c

    return client


def last_code() -> str:
    """The 6-digit code in the most recent email."""
    return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
