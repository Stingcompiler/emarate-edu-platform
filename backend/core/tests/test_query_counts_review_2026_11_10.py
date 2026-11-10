"""Query counts of the pages added since the first November review (review 2026-11-10, axis 5):
each stays the same whatever the number of rows. A count that grows with the rows is an N+1."""

import pytest
from django.utils import timezone

from academic.models import DepartmentMembership
from accounts.rbac import Role
from content.models import StaffEntry, StaffGroup, StaffPlacement
from students.models import StudentRecord


def _staff(n: int, it_dept, make_user):
    group = StaffGroup.objects.get(name_ar="هيئة الإدارة")
    for i in range(n):
        teacher = make_user(Role.TEACHER, public_profile=True, full_name_ar=f"د. عضو {i}")
        DepartmentMembership.objects.create(department=it_dept, user=teacher, kind="teacher")
        admin = make_user(Role.HR, public_profile=True, full_name_ar=f"أ. موظف {i}")
        StaffPlacement.objects.create(entry=StaffEntry.objects.create(user=admin), group=group)
        StaffPlacement.objects.create(
            entry=StaffEntry.objects.create(name_ar=f"شخص {i}"), group=group
        )


@pytest.mark.parametrize("url", ["/api/v1/site-staff", "/api/public/staff"])
def test_the_staff_pages_are_constant(count_queries, make_user, it_dept, url):
    manager = make_user(Role.SITE_MANAGER)
    who = None if url.startswith("/api/public") else manager
    _staff(2, it_dept, make_user)
    at_n = count_queries(who, url)
    _staff(6, it_dept, make_user)
    assert count_queries(who, url) == at_n


def _students(n: int, start: int, program):
    StudentRecord.objects.bulk_create(
        StudentRecord(
            program=program,
            department_id=program.department_id,
            university_number=f"26-IT-{start + i:04d}",
            full_name_ar=f"طالب {start + i}",
            level=1 + i % 3,
        )
        for i in range(n)
    )


@pytest.mark.parametrize(
    "url", ["/api/v1/student-promotion", "/api/v1/students", "/api/v1/registration-requests"]
)
def test_the_student_pages_are_constant(count_queries, make_user, it_program, term, url):
    head = make_user(Role.HEAD_REGISTRAR)
    _students(5, 0, it_program)
    at_n = count_queries(head, url)
    _students(40, 100, it_program)
    assert count_queries(head, url) == at_n


def test_the_deletion_requests_are_constant(count_queries, make_user):
    from content.models import Announcement, DeletionRequest

    admin = make_user(Role.SYSTEM_ADMIN)

    def grow(n):
        for _ in range(n):
            author = make_user(Role.ACADEMIC_AFFAIRS)
            item = Announcement.objects.create(
                scope="college",
                audience="staff",
                title="إعلان",
                body="<p>نص</p>",
                status="published",
                publish_at=timezone.now(),
                created_by=author,
            )
            DeletionRequest.objects.create(
                kind="announcement", object_id=item.pk, title=item.title, requested_by=author
            )

    grow(2)
    at_n = count_queries(admin, "/api/v1/deletion-requests")
    grow(8)
    assert count_queries(admin, "/api/v1/deletion-requests") == at_n
