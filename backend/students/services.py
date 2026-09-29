"""Writes on student records outside the import (owner 2026-09-29).

A department manager or supervisor adds, corrects and (manager only) deletes the
records of their own department; the head registrar and the system admin
everywhere. Every write is audited. Deleting is for a record added by mistake:
a record with an account or any academic history (enrolments, results, exam
attempts, an application) cannot be deleted.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.utils import timezone
from django.utils.translation import gettext
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts import rbac
from audit.services import RequestMeta, record, snapshot
from core.errors import Conflict

from .models import StudentRecord, UniversityNumberSequence


def issue_university_number(program) -> str:
    """The next number like 26-IT-0117 for ``program``'s department. Call inside a transaction."""
    department = program.department
    year = timezone.now().year % 100
    sequence, _ = UniversityNumberSequence.objects.select_for_update().get_or_create(
        college=department.college, year=year, prefix=department.code
    )
    while True:
        sequence.last_value += 1
        number = f"{year:02d}-{department.code}-{sequence.last_value:04d}"
        if not StudentRecord.objects.filter(university_number=number).exists():
            sequence.save(update_fields=["last_value"])
            return number


def _require(meta: RequestMeta, capability: str, department_id: int) -> None:
    if not rbac.can(meta.actor, capability, department_id):
        raise PermissionDenied(gettext("Outside your department scope."))


def _check_level(program, level: int) -> None:
    if not 1 <= level <= program.levels_count:
        raise ValidationError(
            {
                "level": gettext("level: must be between 1 and %(levels_count)s")
                % {"levels_count": program.levels_count}
            }
        )


def create_record(meta: RequestMeta, **data) -> StudentRecord:
    program = data["program"]
    _require(meta, "students.manage", program.department_id)
    _check_level(program, data["level"])
    with transaction.atomic():
        number = data.pop("university_number", "") or issue_university_number(program)
        if StudentRecord.objects.filter(university_number=number).exists():
            raise ValidationError({"university_number": gettext("This number is already in use.")})
        try:
            obj = StudentRecord.objects.create(university_number=number, **data)
        except IntegrityError as error:
            raise ValidationError(
                {"university_number": gettext("This number is already in use.")}
            ) from error
        record(meta, "students.create", obj, new=snapshot(obj), department_id=obj.department_id)
    return obj


def update_record(meta: RequestMeta, obj: StudentRecord, **data) -> StudentRecord:
    _require(meta, "students.manage", obj.department_id)
    program = data.get("program", obj.program)
    if program.department_id != obj.department_id:
        # Moving a student to another department's program needs scope there too.
        _require(meta, "students.manage", program.department_id)
    _check_level(program, data.get("level", obj.level))
    number = data.pop("university_number", "")
    if number and number != obj.university_number:
        if obj.user_id is not None:
            # The number is how the student signs in; it changes only before activation.
            raise ValidationError(
                {"university_number": gettext("The student has activated an account with it.")}
            )
        if StudentRecord.objects.exclude(pk=obj.pk).filter(university_number=number).exists():
            raise ValidationError({"university_number": gettext("This number is already in use.")})
        data["university_number"] = number
    old = snapshot(obj)
    with transaction.atomic():
        for field, value in data.items():
            setattr(obj, field, value)
        obj.save()
        record(
            meta,
            "students.update",
            obj,
            old=old,
            new=snapshot(obj),
            department_id=obj.department_id,
        )
    return obj


def delete_record(meta: RequestMeta, obj: StudentRecord) -> None:
    _require(meta, "students.delete", obj.department_id)
    history = (
        obj.user_id is not None
        or obj.enrollments.exists()
        or obj.results.exists()
        or obj.exam_attempts.exists()
    )
    if history:
        raise Conflict(
            gettext(
                "This student has an account or academic history; it cannot be deleted. "
                "Ask student affairs to change the status instead."
            ),
            code="has_history",
        )
    old = snapshot(obj)
    department_id = obj.department_id
    try:
        with transaction.atomic():
            record(meta, "students.delete", obj, old=old, department_id=department_id)
            obj.delete()
    except ProtectedError as error:
        raise Conflict(
            gettext(
                "This student has an account or academic history; it cannot be deleted. "
                "Ask student affairs to change the status instead."
            ),
            code="has_history",
        ) from error
