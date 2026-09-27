"""Writes for lectures, assignments, submissions and grades — each audited."""

from __future__ import annotations

import re
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from audit.services import RequestMeta, record, snapshot
from core.errors import Conflict, Invalid
from files.models import Purpose, StoredFile, VideoAsset
from files.validation import extension_of
from notifications import events
from students.models import StudentRecord

from . import access
from .models import (
    Assignment,
    Lecture,
    LectureResource,
    Submission,
    SubmissionGrade,
    SubmissionVersion,
)


def _dept(offering) -> int:
    return offering.course.department_id


def require(user, offering, flag: str) -> access.OfferingAccess:
    """404 if the user cannot see the offering at all, 403 if they lack ``flag``."""
    found = access.for_offering(user, offering)
    if not found.any:
        raise NotFound()
    if not getattr(found, flag):
        raise PermissionDenied()
    return found


# ─── Lectures ─────────────────────────────────────────────────────────────


def create_lecture(meta: RequestMeta, **data) -> Lecture:
    require(meta.actor, data["offering"], "edit")
    with transaction.atomic():
        lecture = Lecture.objects.create(created_by=meta.actor, **data)
        record(
            meta,
            "lecture.create",
            lecture,
            new=snapshot(lecture),
            department_id=_dept(lecture.offering),
        )
    return lecture


def update_lecture(meta: RequestMeta, lecture: Lecture, **data) -> Lecture:
    require(meta.actor, lecture.offering, "edit")
    old = snapshot(lecture)
    with transaction.atomic():
        for field, value in data.items():
            setattr(lecture, field, value)
        lecture.save()
        record(
            meta,
            "lecture.update",
            lecture,
            old=old,
            new=snapshot(lecture),
            department_id=_dept(lecture.offering),
        )
    return lecture


def set_lecture_published(meta: RequestMeta, lecture: Lecture, published: bool) -> Lecture:
    require(meta.actor, lecture.offering, "edit")
    first_time = lecture.published_at is None
    with transaction.atomic():
        lecture.is_published = published
        if published and lecture.published_at is None:
            lecture.published_at = timezone.now()
        lecture.save(update_fields=["is_published", "published_at", "updated_at"])
        record(
            meta,
            "lecture.publish" if published else "lecture.unpublish",
            lecture,
            department_id=_dept(lecture.offering),
        )
        if published and first_time:
            events.lecture_published(lecture)
    return lecture


def delete_lecture(meta: RequestMeta, lecture: Lecture) -> None:
    found = require(meta.actor, lecture.offering, "view_all")
    if not found.can_delete(meta.actor, lecture):
        raise PermissionDenied("You cannot delete this lecture.")
    with transaction.atomic():
        record(
            meta,
            "lecture.delete",
            lecture,
            old=snapshot(lecture),
            department_id=_dept(lecture.offering),
        )
        lecture.delete()


def add_resource(
    meta: RequestMeta,
    lecture: Lecture,
    *,
    kind: str,
    title: str,
    file=None,
    video=None,
    url: str = "",
    order: int = 1,
) -> LectureResource:
    require(meta.actor, lecture.offering, "edit")
    if kind == LectureResource.Kind.FILE:
        if not isinstance(file, StoredFile) or video or url:
            raise ValidationError({"file": ["A file resource needs exactly one uploaded file."]})
        if file.purpose != Purpose.LECTURE or file.offering_id != lecture.offering_id:
            raise ValidationError({"file": ["Upload the file to this course first."]})
    elif kind == LectureResource.Kind.VIDEO or (kind == LectureResource.Kind.RECORDING and video):
        if not isinstance(video, VideoAsset) or file or url:
            raise ValidationError({"video": ["A video resource needs exactly one video."]})
        if video.offering_id != lecture.offering_id:
            raise ValidationError({"video": ["Upload the video to this course first."]})
    else:
        if not url or file or video:
            raise ValidationError({"url": ["A link resource needs a URL."]})
    with transaction.atomic():
        resource = LectureResource.objects.create(
            lecture=lecture, kind=kind, title=title, file=file, video=video, url=url, order=order
        )
        record(
            meta,
            "lecture.resource_add",
            lecture,
            new={"kind": kind, "title": title},
            department_id=_dept(lecture.offering),
        )
    return resource


def remove_resource(meta: RequestMeta, resource: LectureResource) -> None:
    lecture = resource.lecture
    require(meta.actor, lecture.offering, "edit")
    with transaction.atomic():
        record(
            meta,
            "lecture.resource_remove",
            lecture,
            old={"kind": resource.kind, "title": resource.title},
            department_id=_dept(lecture.offering),
        )
        resource.delete()


# ─── Assignments ──────────────────────────────────────────────────────────


def _link_fields(assignment: Assignment, fields: list[dict] | None) -> None:
    if fields is None:
        return
    for item in fields:
        pattern = item.get("url_pattern", "")
        if pattern:
            try:
                re.compile(pattern)
            except re.error:
                raise ValidationError({"link_fields": [f"Invalid pattern: {pattern}"]}) from None
    assignment.link_fields.all().delete()
    assignment.link_fields.bulk_create(
        [assignment.link_fields.model(assignment=assignment, **item) for item in fields]
    )


def create_assignment(meta: RequestMeta, link_fields=None, **data) -> Assignment:
    require(meta.actor, data["offering"], "edit")
    with transaction.atomic():
        assignment = Assignment.objects.create(created_by=meta.actor, **data)
        _link_fields(assignment, link_fields)
        record(
            meta,
            "assignment.create",
            assignment,
            new=snapshot(assignment),
            department_id=_dept(assignment.offering),
        )
    return assignment


def update_assignment(
    meta: RequestMeta, assignment: Assignment, link_fields=None, **data
) -> Assignment:
    require(meta.actor, assignment.offering, "edit")
    old = snapshot(assignment)
    with transaction.atomic():
        for field, value in data.items():
            setattr(assignment, field, value)
        assignment.save()
        _link_fields(assignment, link_fields)
        record(
            meta,
            "assignment.update",
            assignment,
            old=old,
            new=snapshot(assignment),
            department_id=_dept(assignment.offering),
        )
    return assignment


def set_assignment_status(meta: RequestMeta, assignment: Assignment, status: str) -> Assignment:
    require(meta.actor, assignment.offering, "edit")
    if status == Assignment.Status.PUBLISHED and not assignment.submission_types:
        raise ValidationError({"submission_types": ["Choose how students submit first."]})
    with transaction.atomic():
        old = assignment.status
        assignment.status = status
        assignment.save(update_fields=["status", "updated_at"])
        if status == Assignment.Status.PUBLISHED and old == Assignment.Status.DRAFT:
            events.assignment_published(assignment)
        record(
            meta,
            f"assignment.{status}",
            assignment,
            old={"status": old},
            new={"status": status},
            department_id=_dept(assignment.offering),
        )
    return assignment


def delete_assignment(meta: RequestMeta, assignment: Assignment) -> None:
    found = require(meta.actor, assignment.offering, "view_all")
    if not found.can_delete(meta.actor, assignment):
        raise PermissionDenied("You cannot delete this assignment.")
    if assignment.submissions.exists():
        raise Conflict("Students have submitted; close the assignment instead.", code="in_use")
    with transaction.atomic():
        record(
            meta,
            "assignment.delete",
            assignment,
            old=snapshot(assignment),
            department_id=_dept(assignment.offering),
        )
        assignment.delete()


# ─── Submissions ──────────────────────────────────────────────────────────


def _lateness(assignment: Assignment, now) -> bool:
    if assignment.opens_at and now < assignment.opens_at:
        raise Invalid({"detail": ["Submissions have not opened yet."]}, code="not_open")
    if now <= assignment.due_at:
        return False
    if assignment.late_policy == Assignment.LatePolicy.NONE:
        raise Invalid({"detail": ["The deadline has passed."]}, code="deadline_passed")
    if assignment.late_until and now > assignment.late_until:
        raise Invalid({"detail": ["The late window has closed."]}, code="deadline_passed")
    return True


def _submission_files(user, assignment: Assignment, public_ids: list) -> list[StoredFile]:
    if len(public_ids) > assignment.max_files:
        raise ValidationError({"files": [f"At most {assignment.max_files} files."]})
    files = list(
        StoredFile.objects.filter(
            public_id__in=public_ids,
            purpose=Purpose.SUBMISSION,
            offering=assignment.offering,
            uploaded_by=user,
        )
    )
    if len(files) != len(set(public_ids)):
        raise ValidationError({"files": ["Upload each file to this course first."]})
    allowed = {e.lower().lstrip(".") for e in assignment.allowed_extensions}
    for item in files:
        if allowed and extension_of(item.name) not in allowed:
            raise ValidationError({"files": [f"{item.name}: type not accepted here."]})
        if item.size > assignment.max_file_size_mb * 1024 * 1024:
            raise ValidationError(
                {"files": [f"{item.name}: larger than {assignment.max_file_size_mb} MB."]}
            )
    return files


def _links(assignment: Assignment, links: dict) -> dict:
    fields = {f.label: f for f in assignment.link_fields.all()}
    clean = {}
    for label, field in fields.items():
        value = str(links.get(label, "")).strip()
        if not value:
            if field.required:
                raise ValidationError({"links": [f"{label}: required."]})
            continue
        if not re.match(r"^https?://", value):
            raise ValidationError({"links": [f"{label}: must start with http:// or https://."]})
        if field.url_pattern and not re.search(field.url_pattern, value):
            raise ValidationError({"links": [f"{label}: does not match the expected format."]})
        clean[label] = value
    unknown = set(links) - set(fields)
    if unknown:
        raise ValidationError({"links": [f"Unknown link: {sorted(unknown)[0]}"]})
    return clean


def submit(
    meta: RequestMeta, assignment: Assignment, *, content: str = "", files=(), links=None
) -> Submission:
    user = meta.actor
    require(user, assignment.offering, "submit")
    if assignment.status != Assignment.Status.PUBLISHED:
        raise Invalid({"detail": ["This assignment is not accepting submissions."]}, code="closed")
    now = timezone.now()
    is_late = _lateness(assignment, now)
    types = set(assignment.submission_types)
    content = content.strip()
    links = links or {}
    if content and "text" not in types:
        raise ValidationError({"content": ["Text answers are not accepted here."]})
    if files and "file" not in types:
        raise ValidationError({"files": ["Files are not accepted here."]})
    if links and "link" not in types:
        raise ValidationError({"links": ["Links are not accepted here."]})
    stored = _submission_files(user, assignment, list(files))
    clean_links = _links(assignment, links) if "link" in types else {}
    if not (content or stored or clean_links):
        raise Invalid({"detail": ["The submission is empty."]}, code="empty")

    student = StudentRecord.objects.get(user=user)
    with transaction.atomic():
        submission = (
            Submission.objects.select_for_update()
            .filter(assignment=assignment, student_record=student)
            .first()
        )
        if submission is None:
            try:
                with transaction.atomic():
                    submission = Submission.objects.create(
                        assignment=assignment, student_record=student, first_submitted_at=now
                    )
            except IntegrityError:
                raise Conflict("Submitted twice at once; try again.", code="conflict") from None
            number = 1
        else:
            if not assignment.allow_resubmission:
                raise Conflict("Resubmission is not allowed.", code="no_resubmission")
            grade = getattr(submission, "grade", None)
            if grade is not None and grade.status == SubmissionGrade.Status.APPROVED:
                raise Conflict("This submission is already graded.", code="graded")
            number = submission.versions.count() + 1
        version = SubmissionVersion.objects.create(
            submission=submission,
            version_no=number,
            content=content,
            files=[str(f.public_id) for f in stored],
            links=clean_links,
            submitted_at=now,
            is_late=is_late,
        )
        submission.current_version = version
        submission.is_late = is_late
        submission.save(update_fields=["current_version", "is_late", "updated_at"])
        if assignment.grading_mode == Assignment.GradingMode.RULE:
            _rule_grade(submission, version)
        record(
            meta,
            "submission.submit",
            submission,
            new={"version": number, "late": is_late},
            department_id=_dept(assignment.offering),
        )
    return submission


# ─── Grading ──────────────────────────────────────────────────────────────


def _rule_grade(submission: Submission, version: SubmissionVersion) -> None:
    """Basic rule-based grading → a *suggested* grade the teacher approves.

    ``rubric = {"rules": [{"type": ..., "points": n, ...}]}`` with types:
    ``submitted``, ``on_time``, ``min_files`` (count), ``has_link`` (label),
    ``min_words`` (count).
    """
    total = Decimal(0)
    details = {}
    for index, rule in enumerate(submission.assignment.rubric.get("rules", [])):
        points = Decimal(str(rule.get("points", 0)))
        kind = rule.get("type")
        met = {
            "submitted": True,
            "on_time": not version.is_late,
            "min_files": len(version.files) >= int(rule.get("count", 1)),
            "has_link": bool(version.links.get(rule.get("label", ""))),
            "min_words": len(version.content.split()) >= int(rule.get("count", 1)),
        }.get(kind, False)
        details[str(index)] = str(points if met else 0)
        total += points if met else 0
    total = min(total, submission.assignment.max_grade)
    SubmissionGrade.objects.update_or_create(
        submission=submission,
        defaults={
            "score": total,
            "rubric_scores": details,
            "source": SubmissionGrade.Source.RULE,
            "status": SubmissionGrade.Status.SUGGESTED,
            "graded_by": None,
            "graded_at": timezone.now(),
        },
    )


def grade(
    meta: RequestMeta, submission: Submission, *, score, feedback: str = "", rubric_scores=None
) -> SubmissionGrade:
    assignment = submission.assignment
    require(meta.actor, assignment.offering, "grade")
    if not 0 <= score <= assignment.max_grade:
        raise ValidationError({"score": [f"Between 0 and {assignment.max_grade}."]})
    with transaction.atomic():
        existing = SubmissionGrade.objects.filter(submission=submission).first()
        old = {"score": str(existing.score), "status": existing.status} if existing else None
        result, _ = SubmissionGrade.objects.update_or_create(
            submission=submission,
            defaults={
                "score": score,
                "feedback": feedback,
                "rubric_scores": rubric_scores or {},
                "source": SubmissionGrade.Source.MANUAL,
                "status": SubmissionGrade.Status.APPROVED,
                "graded_by": meta.actor,
                "graded_at": timezone.now(),
            },
        )
        events.grade_released(submission)
        record(
            meta,
            "submission.grade",
            submission,
            old=old,
            new={"score": str(score)},
            department_id=_dept(assignment.offering),
        )
    return result


def approve_grade(meta: RequestMeta, submission: Submission) -> SubmissionGrade:
    assignment = submission.assignment
    require(meta.actor, assignment.offering, "grade")
    result = SubmissionGrade.objects.filter(submission=submission).first()
    if result is None or result.status != SubmissionGrade.Status.SUGGESTED:
        raise Conflict("There is no suggested grade to approve.", code="nothing_to_approve")
    # docs/03 §3.9: a TA never gives final approval to an AI-suggested grade.
    if result.source == SubmissionGrade.Source.AI_SUGGESTED and _is_ta(
        meta.actor, assignment.offering
    ):
        raise PermissionDenied("Only the teacher approves AI-suggested grades.")
    with transaction.atomic():
        result.status = SubmissionGrade.Status.APPROVED
        result.graded_by = meta.actor
        result.graded_at = timezone.now()
        result.save(update_fields=["status", "graded_by", "graded_at", "updated_at"])
        events.grade_released(submission)
        record(
            meta,
            "submission.grade_approve",
            submission,
            new={"score": str(result.score), "source": result.source},
            department_id=_dept(assignment.offering),
        )
    return result


def _is_ta(user, offering) -> bool:
    return offering.instructors.filter(user=user, role="ta").exists()
