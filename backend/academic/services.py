"""Teaching staff, instructor assignments and enrollment workflows."""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts import rbac
from accounts.rbac import Role
from audit.services import RequestMeta, record
from core.errors import Conflict
from organization.models import Department, Program
from students.models import StudentRecord

from .models import CourseOffering, DepartmentMembership, Enrollment, OfferingInstructor, Term

_KIND_ROLE = {"teacher": Role.TEACHER, "ta": Role.TA}


def _require(meta: RequestMeta, capability: str, department_id: int) -> None:
    if not rbac.can(meta.actor, capability, department_id):
        raise PermissionDenied("Outside your department scope.")


# ─── Department membership ────────────────────────────────────────────────


def add_member(meta: RequestMeta, department: Department, user, kind: str) -> DepartmentMembership:
    _require(meta, "membership.manage", department.pk)
    if _KIND_ROLE[kind] not in rbac.roles_of(user):
        raise ValidationError(
            {"user": [f"This person does not have the {kind} role. Academic affairs creates it."]}
        )
    try:
        with transaction.atomic():
            membership = DepartmentMembership.objects.create(
                department=department, user=user, kind=kind, added_by=meta.actor
            )
            record(
                meta,
                "membership.add",
                user,
                new={"department_id": department.pk, "kind": kind},
                department_id=department.pk,
            )
    except IntegrityError:
        raise Conflict("Already a member of this department.", code="already_member") from None
    return membership


def remove_member(meta: RequestMeta, membership: DepartmentMembership) -> None:
    _require(meta, "membership.remove", membership.department_id)
    with transaction.atomic():
        # Removing someone from the department also removes their teaching
        # assignments in that department's open offerings.
        OfferingInstructor.objects.filter(
            user=membership.user,
            offering__course__department=membership.department,
        ).exclude(offering__status=CourseOffering.Status.CLOSED).delete()
        record(
            meta,
            "membership.remove",
            membership.user,
            old={"department_id": membership.department_id, "kind": membership.kind},
            department_id=membership.department_id,
        )
        membership.delete()


# ─── Instructors on an offering ───────────────────────────────────────────


def add_instructor(meta: RequestMeta, offering: CourseOffering, user, role: str) -> OfferingInstructor:
    department_id = offering.course.department_id
    _require(meta, "courses.manage", department_id)
    if _KIND_ROLE[role] not in rbac.roles_of(user):
        raise ValidationError({"user": [f"This person does not have the {role} role."]})
    # Department roles assign their own members; academic affairs / admin assign anyone.
    college_wide = rbac.scope_for(meta.actor, "courses.manage").everything
    if not college_wide and not DepartmentMembership.objects.filter(
        department_id=department_id, user=user
    ).exists():
        raise ValidationError({"user": ["Add this person to the department first."]})
    try:
        with transaction.atomic():
            instructor = OfferingInstructor.objects.create(offering=offering, user=user, role=role)
            record(
                meta,
                "offering.instructor_add",
                offering,
                new={"user_id": user.pk, "role": role},
                department_id=department_id,
            )
    except IntegrityError:
        raise Conflict("Already assigned to this course.", code="already_assigned") from None
    return instructor


def remove_instructor(meta: RequestMeta, instructor: OfferingInstructor) -> None:
    department_id = instructor.offering.course.department_id
    _require(meta, "courses.delete", department_id)
    with transaction.atomic():
        record(
            meta,
            "offering.instructor_remove",
            instructor.offering,
            old={"user_id": instructor.user_id, "role": instructor.role},
            department_id=department_id,
        )
        instructor.delete()


# ─── Enrollment ───────────────────────────────────────────────────────────


def enroll(meta: RequestMeta, offering: CourseOffering, student: StudentRecord) -> Enrollment:
    department_id = offering.course.department_id
    _require(meta, "enrollment.manage", department_id)
    if student.status != StudentRecord.Status.ACTIVE:
        raise ValidationError({"student_record": ["Only active students can be enrolled."]})
    if offering.status == CourseOffering.Status.CLOSED:
        raise ValidationError({"offering": ["This offering is closed."]})
    with transaction.atomic():
        enrollment, created = Enrollment.objects.get_or_create(
            offering=offering, student_record=student, defaults={"source": Enrollment.Source.MANUAL}
        )
        if not created:
            if enrollment.status == Enrollment.Status.ACTIVE:
                raise Conflict("Already enrolled.", code="already_enrolled")
            enrollment.status = Enrollment.Status.ACTIVE
            enrollment.save(update_fields=["status", "updated_at"])
        record(
            meta,
            "enrollment.add",
            student,
            new={"offering_id": offering.pk},
            department_id=department_id,
        )
    return enrollment


def drop(meta: RequestMeta, enrollment: Enrollment) -> Enrollment:
    department_id = enrollment.offering.course.department_id
    _require(meta, "enrollment.manage", department_id)
    if enrollment.status != Enrollment.Status.ACTIVE:
        raise Conflict("This enrollment is not active.", code="not_active")
    with transaction.atomic():
        enrollment.status = Enrollment.Status.DROPPED
        enrollment.save(update_fields=["status", "updated_at"])
        record(
            meta,
            "enrollment.drop",
            enrollment.student_record,
            old={"offering_id": enrollment.offering_id, "status": "active"},
            department_id=department_id,
        )
    return enrollment


def bulk_enroll(meta: RequestMeta, term: Term, program: Program, level: int) -> dict:
    """Enroll every active student of (program, level) in that level's offerings this term.

    Idempotent: existing enrollments are left untouched, so running it again
    only picks up students or offerings added since.
    """
    _require(meta, "enrollment.manage", program.department_id)
    offerings = list(
        CourseOffering.objects.filter(
            term=term,
            course__default_level=level,
            status=CourseOffering.Status.ACTIVE,
        ).filter(
            Q(course__program=program)
            | Q(course__program__isnull=True, course__department=program.department)
        )
    )
    students = list(
        StudentRecord.objects.filter(
            program=program, level=level, status=StudentRecord.Status.ACTIVE
        )
    )
    existing = set(
        Enrollment.objects.filter(offering__in=offerings, student_record__in=students).values_list(
            "offering_id", "student_record_id"
        )
    )
    to_create = [
        Enrollment(offering=o, student_record=s, source=Enrollment.Source.BULK)
        for o in offerings
        for s in students
        if (o.pk, s.pk) not in existing
    ]
    with transaction.atomic():
        Enrollment.objects.bulk_create(to_create, ignore_conflicts=True)
        summary = {
            "offerings": len(offerings),
            "students": len(students),
            "created": len(to_create),
            "already_enrolled": len(existing),
        }
        record(
            meta,
            "enrollment.bulk",
            program,
            new={"term_id": term.pk, "level": level, **summary},
            department_id=program.department_id,
        )
    return summary
