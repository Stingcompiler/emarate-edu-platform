"""Promotion: students move on a semester at the end of a term (owner, 2026-11-05).

The college plans by level 1–5 (a year) and two semesters a level. At the end of the current
term the head registrar promotes the active students: (level, 1) → (level, 2) and
(level, 2) → (level + 1, 1). A student in the programme's last semester stays (graduating is
a status the registrar sets). Those who failed courses move with their cohort and carry the
courses; the registrar leaves out by name anyone who stays.
"""

from __future__ import annotations

from collections import Counter

from django.db import transaction
from django.utils.translation import gettext
from rest_framework.exceptions import PermissionDenied, ValidationError

from academic.models import Term
from accounts import rbac
from audit.services import RequestMeta, record
from core.errors import Conflict

from .models import PromotionRun, StudentRecord

CAPABILITY = "students.promote"


def next_place(student: StudentRecord) -> tuple[int, int] | None:
    """Where the student goes next, or None in the programme's last semester."""
    if student.semester == 1:
        return student.level, 2
    if student.level < student.program.levels_count:
        return student.level + 1, 1
    return None


def _current_term() -> Term:
    term = Term.current()
    if term is None:
        raise ValidationError({"term": [gettext("There is no current term.")]})
    return term


def _done_for(term: Term, department_id: int | None) -> PromotionRun | None:
    """A run this term covering the department (or any run, for the whole college)."""
    runs = PromotionRun.objects.filter(term=term)
    if department_id is not None:
        runs = runs.filter(department_id__in=[department_id]) | runs.filter(
            department_id__isnull=True
        )
    return runs.order_by("-created_at").first()


def _students(department_id: int | None):
    queryset = StudentRecord.objects.filter(status=StudentRecord.Status.ACTIVE).select_related(
        "program", "department"
    )
    if department_id is not None:
        queryset = queryset.filter(department_id=department_id)
    return queryset.order_by("program__name_ar", "level", "semester", "full_name_ar")


def _require(user) -> None:
    if not rbac.can(user, CAPABILITY):
        raise PermissionDenied()


def preview(user, department_id: int | None = None) -> dict:
    _require(user)
    term = _current_term()
    rows = []
    for student in _students(department_id):
        to = next_place(student)
        rows.append(
            {
                "public_id": student.public_id,
                "university_number": student.university_number,
                "full_name_ar": student.full_name_ar,
                "program_name": student.program.name_ar,
                "department_name": student.department.name_ar,
                "level": student.level,
                "semester": student.semester,
                "to_level": to[0] if to else None,
                "to_semester": to[1] if to else None,
            }
        )
    done = _done_for(term, department_id)
    return {
        "term": term.pk,
        "term_name": term.name_ar,
        "done_at": done.created_at if done else None,
        "students": rows,
    }


def promote(
    meta: RequestMeta, department_id: int | None = None, exclude: list | None = None
) -> dict:
    """Move every active student in scope on a semester, but the excluded. Once per term."""
    _require(meta.actor)
    excluded = {str(public_id) for public_id in (exclude or [])}
    with transaction.atomic():
        term = Term.objects.select_for_update().get(pk=_current_term().pk)
        if _done_for(term, department_id):
            raise Conflict(
                gettext("The students were already promoted at the end of this term."),
                code="already_promoted",
            )
        moves: Counter = Counter()
        kept = last = 0
        students = list(_students(department_id).select_for_update(of=("self",)))
        for student in students:
            if str(student.public_id) in excluded:
                kept += 1
                continue
            to = next_place(student)
            if to is None:
                last += 1
                continue
            moves[(student.level, student.semester, *to)] += 1
            student.level, student.semester = to
        StudentRecord.objects.bulk_update(
            [s for s in students if str(s.public_id) not in excluded], ["level", "semester"]
        )
        summary = {
            "promoted": sum(moves.values()),
            "kept": kept,
            "last_semester": last,
            "moves": [
                {"from": [a, b], "to": [c, d], "count": n}
                for (a, b, c, d), n in sorted(moves.items())
            ],
        }
        run = PromotionRun.objects.create(
            term=term, department_id=department_id, run_by=meta.actor, summary=summary
        )
        record(
            meta,
            "students.promote",
            run,
            new={
                "term": term.name_ar,
                **summary,
                "kept_numbers": sorted(
                    s.university_number for s in students if str(s.public_id) in excluded
                ),
            },
            department_id=department_id,
        )
    return {"term_name": term.name_ar, **summary}
