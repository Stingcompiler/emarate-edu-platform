"""Results file import: parse → validate → preview (docs/05 §8.4).

Columns (Arabic or English): university number, course code, optional
section, score, optional letter, optional status. Each row must name a
student enrolled in that course's offering for the batch's term.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction

from academic.models import CourseOffering, Enrollment
from audit.services import RequestMeta, record
from students.importer import ImportFileError, read_table
from students.models import StudentRecord

from .models import AcademicResult, GradingScale, ResultImportBatch, ResultImportRow

HEADERS = {
    "university_number": "university_number",
    "الرقم الجامعي": "university_number",
    "course_code": "course_code",
    "course": "course_code",
    "رمز المقرر": "course_code",
    "المقرر": "course_code",
    "section": "section",
    "الشعبة": "section",
    "score": "score",
    "mark": "score",
    "الدرجة": "score",
    "letter": "letter",
    "grade": "letter",
    "التقدير": "letter",
    "status": "status",
    "الحالة": "status",
}
REQUIRED = ("university_number", "course_code")
STATUSES = {
    "pass": "pass",
    "ناجح": "pass",
    "fail": "fail",
    "راسب": "fail",
    "absent": "absent",
    "غائب": "absent",
    "withdrawn": "withdrawn",
    "منسحب": "withdrawn",
    "incomplete": "incomplete",
    "غير مكتمل": "incomplete",
}
NO_SCORE = {"absent", "withdrawn", "incomplete"}


def _norm(value) -> str:
    return " ".join(str(value if value is not None else "").split())


def _normalize(raw: dict, term, allowed_departments, cache) -> tuple[dict, list[str], tuple]:
    errors: list[str] = []
    number = _norm(raw.get("university_number"))
    code = _norm(raw.get("course_code")).upper()
    section = _norm(raw.get("section")) or "A"
    for field in REQUIRED:
        if not _norm(raw.get(field)):
            errors.append(f"{field}: required")

    student = cache["students"].get(number)
    if number and student is None:
        errors.append("university_number: no such student")
    offering = cache["offerings"].get((code, section))
    if code and offering is None:
        errors.append(f"course_code: no offering {code}-{section} in this term")
    if (
        offering is not None
        and allowed_departments is not None
        and offering.course.department_id not in allowed_departments
    ):
        errors.append("course_code: outside your department")
    if student and offering and (student.pk, offering.pk) not in cache["enrolled"]:
        errors.append("university_number: not enrolled in this course")

    status = STATUSES.get(_norm(raw.get("status")).lower()) if raw.get("status") else None
    if raw.get("status") and status is None:
        errors.append("status: use pass/fail/absent/withdrawn/incomplete")
    score = None
    score_raw = _norm(raw.get("score"))
    if score_raw:
        try:
            score = Decimal(score_raw)
        except InvalidOperation:
            errors.append("score: must be a number")
        else:
            if not 0 <= score <= 100:
                errors.append("score: must be between 0 and 100")
    elif status not in NO_SCORE:
        errors.append("score: required")

    letter, points = "", Decimal(0)
    if score is not None and not errors and student is not None:
        ranges = cache["scales"].setdefault(
            student.program_id, GradingScale.for_program(student.program_id)
        )
        letter, points = GradingScale.grade(ranges, score)
        given = _norm(raw.get("letter")).upper()
        if given and given != letter.upper():
            errors.append(f"letter: {given} does not match the scale ({letter} for {score})")
    if status is None and score is not None:
        status = "fail" if letter.upper() == "F" else "pass"
    key = (student.pk if student else None, offering.pk if offering else None)
    normalized = {
        "university_number": number,
        "course_code": code,
        "section": section,
        "score": str(score) if score is not None else None,
        "letter": letter,
        "grade_points": str(points),
        "status": status,
    }
    return normalized, errors, key


def validate_file(meta: RequestMeta, *, term, department, allowed_departments, name, uploaded):
    table_rows, columns = read_table(name, uploaded.read(), HEADERS, REQUIRED)
    uploaded.seek(0)
    numbers = {_norm(r.get("university_number")) for r in table_rows}
    offerings = CourseOffering.objects.filter(term=term).select_related("course")
    if department is not None:
        offerings = offerings.filter(course__department=department)
    cache = {
        "students": {
            s.university_number: s
            for s in StudentRecord.objects.filter(university_number__in=numbers)
        },
        "offerings": {(o.course.code.upper(), o.section): o for o in offerings},
        "enrolled": set(
            Enrollment.objects.filter(offering__term=term)
            .exclude(status=Enrollment.Status.DROPPED)
            .values_list("student_record_id", "offering_id")
        ),
        "scales": {},
    }
    existing = set(
        AcademicResult.objects.filter(term=term).values_list("student_record_id", "offering_id")
    )
    seen: set[tuple] = set()
    rows, counts = [], {"create": 0, "error": 0}
    for index, raw in enumerate(table_rows, start=2):
        normalized, errors, key = _normalize(raw, term, allowed_departments, cache)
        if None not in key:
            if key in seen:
                errors.append("duplicated in this file")
            elif key in existing:
                errors.append("already has a result; request a correction instead")
            seen.add(key)
        action = ResultImportRow.Action.ERROR if errors else ResultImportRow.Action.CREATE
        counts[action] += 1
        rows.append(
            ResultImportRow(
                row_no=index,
                raw={k: _norm(v) for k, v in raw.items()},
                student_record_id=key[0],
                offering_id=key[1],
                normalized=normalized,
                action=action,
                errors=errors,
            )
        )
    with transaction.atomic():
        batch = ResultImportBatch.objects.create(
            file=uploaded,
            file_name=name[:255],
            scope=ResultImportBatch.Scope.DEPARTMENT
            if department
            else ResultImportBatch.Scope.COLLEGE,
            department=department,
            term=term,
            uploaded_by=meta.actor,
            status=(
                ResultImportBatch.Status.HAS_ERRORS
                if counts["error"]
                else ResultImportBatch.Status.VALIDATED
            ),
            detected_columns=columns,
            summary={"rows": len(rows), **counts},
        )
        for row in rows:
            row.batch = batch
        ResultImportRow.objects.bulk_create(rows)
        record(
            meta,
            "results.import_validate",
            batch,
            new=batch.summary,
            department_id=department.pk if department else None,
        )
    return batch


__all__ = ["ImportFileError", "validate_file"]
