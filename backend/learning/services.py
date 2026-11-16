"""Writes for lectures, assignments, submissions and grades — each audited."""

from __future__ import annotations

import logging
import re
from decimal import Decimal

from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from django.utils.translation import gettext
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
    LectureView,
    Submission,
    SubmissionGrade,
    SubmissionVersion,
)

logger = logging.getLogger(__name__)


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


def reorder_lectures(meta: RequestMeta, offering, public_ids: list[str]) -> None:
    """Renumber an offering's lectures 1…n in the given order (docs/07: a list sorted by drag).

    The list must name every lecture of the offering exactly once, so a stale screen can't
    leave two lectures at the same place.
    """
    require(meta.actor, offering, "edit")
    wanted = [str(p) for p in public_ids]
    with transaction.atomic():
        lectures = list(Lecture.objects.select_for_update().filter(offering=offering))
        by_id = {str(lec.public_id): lec for lec in lectures}
        if len(wanted) != len(set(wanted)) or set(wanted) != set(by_id):
            raise ValidationError(
                {"lectures": gettext("The list must name every lecture of the course once.")}
            )
        old = [str(lec.public_id) for lec in lectures]  # Meta ordering: order, then id
        changed = []
        for n, pid in enumerate(wanted, start=1):
            lec = by_id[pid]
            if lec.order != n:
                lec.order = n
                changed.append(lec)
        Lecture.objects.bulk_update(changed, ["order"])
        record(
            meta,
            "lecture.reorder",
            offering,
            old={"order": old},
            new={"order": wanted},
            department_id=_dept(offering),
        )


def record_view(user, lecture: Lecture) -> bool:
    """Note that an enrolled student opened a published lecture. Anyone else: nothing."""
    if not lecture.is_published:
        return False
    record_ = StudentRecord.objects.filter(user=user).first()
    if record_ is None or not access.for_offering(user, lecture.offering).submit:
        return False
    seen, created = LectureView.objects.get_or_create(lecture=lecture, student_record=record_)
    if not created:
        LectureView.objects.filter(pk=seen.pk).update(
            times=F("times") + 1, last_seen_at=timezone.now()
        )
    return True


def _own_media(lecture: Lecture) -> tuple[list, list]:
    """The files and videos of the lecture's resources that no other lecture uses."""
    resources = list(lecture.resources.all())
    files = {r.file_id for r in resources if r.file_id}
    videos = {r.video_id for r in resources if r.video_id}
    others = LectureResource.objects.exclude(lecture=lecture)
    files -= set(others.filter(file_id__in=files).values_list("file_id", flat=True))
    videos -= set(others.filter(video_id__in=videos).values_list("video_id", flat=True))
    return (
        list(StoredFile.objects.filter(pk__in=files)),
        list(VideoAsset.objects.filter(pk__in=videos)),
    )


def lecture_holds(lecture: Lecture) -> dict:
    """What deleting the lecture takes with it, for its confirmation (owner, 2026-11-16)."""
    files, videos = _own_media(lecture)
    return {
        "assignments": lecture.assignments.count(),
        "submissions": Submission.objects.filter(assignment__lecture=lecture).count(),
        "files": len(files),
        "videos": len(videos),
    }


def delete_lecture(meta: RequestMeta, lecture: Lecture) -> None:
    """The lecture with everything in it (owner, 2026-11-16: «حذف محاضرة يحذف كل ما بها»): its
    resources and views, the assignments linked to it with their submissions, grades and files,
    and its files and videos no other lecture uses. The log keeps the assignments' submitters
    and grades."""
    from django.db.models.deletion import ProtectedError

    found = require(meta.actor, lecture.offering, "view_all")
    if not found.can_delete(meta.actor, lecture):
        raise PermissionDenied(gettext("You cannot delete this lecture."))
    with transaction.atomic():
        assignments = list(lecture.assignments.all())
        submissions = list(
            Submission.objects.filter(assignment__in=assignments)
            .select_related("student_record", "grade")
            .select_for_update(of=("self",))
        )
        files, videos = _own_media(lecture)
        record(
            meta,
            "lecture.delete",
            lecture,
            old={
                **snapshot(lecture),
                "assignments": [
                    {
                        "title": a.title,
                        "submissions": [
                            _work_of(s) for s in submissions if s.assignment_id == a.pk
                        ],
                    }
                    for a in assignments
                ],
                "files": [f.name for f in files],
                "videos": [v.title for v in videos],
            },
            department_id=_dept(lecture.offering),
        )
        stored = _uploaded_with(submissions)
        for submission in submissions:
            submission.delete()  # its versions and grade go with it (CASCADE)
        _remove_files(stored)
        for assignment in assignments:
            assignment.delete()
        lecture.delete()  # its resources and views (CASCADE)
        # Its own files and videos — unless something else still holds one (a case's
        # attachment, say): that one stays.
        kept = []
        for item in [*files, *videos]:
            try:
                with transaction.atomic():
                    _remove_files([item])
            except ProtectedError:
                kept.append(item)
        if kept:
            logger.info("lecture.delete: %s media still used elsewhere were kept", len(kept))


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
            raise ValidationError(
                {"file": [gettext("A file resource needs exactly one uploaded file.")]}
            )
        if file.purpose != Purpose.LECTURE or file.offering_id != lecture.offering_id:
            raise ValidationError({"file": [gettext("Upload the file to this course first.")]})
    elif kind == LectureResource.Kind.VIDEO or (kind == LectureResource.Kind.RECORDING and video):
        if not isinstance(video, VideoAsset) or file or url:
            raise ValidationError({"video": [gettext("A video resource needs exactly one video.")]})
        if video.offering_id != lecture.offering_id:
            raise ValidationError({"video": [gettext("Upload the video to this course first.")]})
    else:
        if not url or file or video:
            raise ValidationError({"url": [gettext("A link resource needs a URL.")]})
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
    # Removing a file or link is a delete: whoever may delete the lecture (review 2026-10-25 R14).
    found = require(meta.actor, lecture.offering, "edit")
    if not found.can_delete(meta.actor, lecture):
        raise PermissionDenied(gettext("You cannot remove files from this lecture."))
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
                raise ValidationError(
                    {
                        "link_fields": [
                            gettext("Invalid pattern: %(pattern)s") % {"pattern": pattern}
                        ]
                    }
                ) from None
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
        raise ValidationError({"submission_types": [gettext("Choose how students submit first.")]})
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


def _uploaded_with(submissions) -> list:
    """The files students uploaded with these submissions (every version)."""
    ids = {
        str(i)
        for files in SubmissionVersion.objects.filter(submission__in=submissions).values_list(
            "files", flat=True
        )
        for i in (files or [])
    }
    return list(StoredFile.objects.filter(public_id__in=ids)) if ids else []


def _remove_files(stored: list) -> None:
    """The rows now, the bytes once the transaction has committed."""
    names = [f.file.name for f in stored if f.file]
    for item in stored:
        item.delete()

    def gone():
        for name in names:
            try:
                default_storage.delete(name)
            except Exception:  # a file already missing is not a failure of the deletion
                logger.warning("could not remove the file %s", name)

    transaction.on_commit(gone)


def _work_of(submission: Submission) -> dict:
    """What the log keeps of a submission before it goes."""
    grade = getattr(submission, "grade", None)
    return {
        "student": submission.student_record.university_number,
        "name": submission.student_record.full_name_ar,
        "versions": submission.versions.count(),
        "late": submission.is_late,
        "grade": str(grade.score) if grade is not None else None,
        "grade_status": grade.status if grade is not None else None,
    }


def delete_assignment(
    meta: RequestMeta, assignment: Assignment, *, with_submissions: bool = False
) -> None:
    """An assignment, and — when asked, once students have submitted (owner, 2026-11-16) — their
    submissions, versions, grades and files with it. The log keeps who submitted and their
    grades."""
    found = require(meta.actor, assignment.offering, "view_all")
    if not found.can_delete(meta.actor, assignment):
        raise PermissionDenied(gettext("You cannot delete this assignment."))
    submitted = assignment.submissions.count()
    if submitted and not with_submissions:
        raise Conflict(
            gettext(
                "%(n)s students have submitted. Delete the assignment with their submissions "
                "and grades, or close it instead."
            )
            % {"n": submitted},
            code="has_submissions",
        )
    with transaction.atomic():
        submissions = list(
            # Lock the submissions only: `grade` is the nullable side of an outer join (PostgreSQL).
            assignment.submissions.select_related("student_record", "grade").select_for_update(
                of=("self",)
            )
        )
        record(
            meta,
            "assignment.delete",
            assignment,
            old={**snapshot(assignment), "submissions": [_work_of(s) for s in submissions]},
            department_id=_dept(assignment.offering),
        )
        stored = _uploaded_with(submissions)
        for submission in submissions:
            submission.delete()  # its versions and grade go with it (CASCADE)
        _remove_files(stored)
        assignment.delete()


def delete_submission(meta: RequestMeta, submission: Submission) -> None:
    """A student's submission, its versions, grade and files (owner, 2026-11-16): the course's
    teacher, or whoever deletes coursework in the department or programme. The student may then
    submit again while the assignment accepts it."""
    found = require(meta.actor, submission.assignment.offering, "view_all")
    if not found.delete_submissions:
        raise PermissionDenied(gettext("You cannot delete this submission."))
    with transaction.atomic():
        submission = (
            Submission.objects.select_for_update(of=("self",))
            .select_related("student_record", "grade", "assignment__offering__course")
            .get(pk=submission.pk)
        )
        record(
            meta,
            "submission.delete",
            submission,
            old={**_work_of(submission), "assignment": submission.assignment.title},
            department_id=_dept(submission.assignment.offering),
        )
        stored = _uploaded_with([submission])
        submission.delete()
        _remove_files(stored)


# ─── Submissions ──────────────────────────────────────────────────────────


def _lateness(assignment: Assignment, now) -> bool:
    if assignment.opens_at and now < assignment.opens_at:
        raise Invalid({"detail": [gettext("Submissions have not opened yet.")]}, code="not_open")
    if now <= assignment.due_at:
        return False
    if assignment.late_policy == Assignment.LatePolicy.NONE:
        raise Invalid({"detail": [gettext("The deadline has passed.")]}, code="deadline_passed")
    if assignment.late_until and now > assignment.late_until:
        raise Invalid({"detail": [gettext("The late window has closed.")]}, code="deadline_passed")
    return True


def _submission_files(user, assignment: Assignment, public_ids: list) -> list[StoredFile]:
    if len(public_ids) > assignment.max_files:
        raise ValidationError(
            {
                "files": [
                    gettext("At most %(max_files)s files.") % {"max_files": assignment.max_files}
                ]
            }
        )
    files = list(
        StoredFile.objects.filter(
            public_id__in=public_ids,
            purpose=Purpose.SUBMISSION,
            offering=assignment.offering,
            uploaded_by=user,
        )
    )
    if len(files) != len(set(public_ids)):
        raise ValidationError({"files": [gettext("Upload each file to this course first.")]})
    allowed = {e.lower().lstrip(".") for e in assignment.allowed_extensions}
    for item in files:
        if allowed and extension_of(item.name) not in allowed:
            raise ValidationError(
                {"files": [gettext("%(name)s: type not accepted here.") % {"name": item.name}]}
            )
        if item.size > assignment.max_file_size_mb * 1024 * 1024:
            raise ValidationError(
                {
                    "files": [
                        gettext("%(name)s: larger than %(max_file_size_mb)s MB.")
                        % {"name": item.name, "max_file_size_mb": assignment.max_file_size_mb}
                    ]
                }
            )
    return files


def _links(assignment: Assignment, links: dict) -> dict:
    fields = {f.label: f for f in assignment.link_fields.all()}
    clean = {}
    for label, field in fields.items():
        value = str(links.get(label, "")).strip()
        if not value:
            if field.required:
                raise ValidationError(
                    {"links": [gettext("%(label)s: required.") % {"label": label}]}
                )
            continue
        if not re.match(r"^https?://", value):
            raise ValidationError(
                {
                    "links": [
                        gettext("%(label)s: must start with http:// or https://.")
                        % {"label": label}
                    ]
                }
            )
        if field.url_pattern and not re.search(field.url_pattern, value):
            raise ValidationError(
                {
                    "links": [
                        gettext("%(label)s: does not match the expected format.") % {"label": label}
                    ]
                }
            )
        clean[label] = value
    unknown = set(links) - set(fields)
    if unknown:
        raise ValidationError(
            {"links": [gettext("Unknown link: %(value)s") % {"value": sorted(unknown)[0]}]}
        )
    return clean


def submit(
    meta: RequestMeta, assignment: Assignment, *, content: str = "", files=(), links=None
) -> Submission:
    user = meta.actor
    require(user, assignment.offering, "submit")
    if assignment.status != Assignment.Status.PUBLISHED:
        raise Invalid(
            {"detail": [gettext("This assignment is not accepting submissions.")]}, code="closed"
        )
    now = timezone.now()
    is_late = _lateness(assignment, now)
    types = set(assignment.submission_types)
    content = content.strip()
    links = links or {}
    # Without «إجابة نصية» the text is the student's note to the teacher (the form offers
    # «ملاحظة للأستاذ (اختياري)»); it goes with a file or a link, never alone (exam test
    # 2026-11-02: a note refused the whole submission).
    if files and "file" not in types:
        raise ValidationError({"files": [gettext("Files are not accepted here.")]})
    if links and "link" not in types:
        raise ValidationError({"links": [gettext("Links are not accepted here.")]})
    stored = _submission_files(user, assignment, list(files))
    clean_links = _links(assignment, links) if "link" in types else {}
    if not ((content and "text" in types) or stored or clean_links):
        raise Invalid({"detail": [gettext("The submission is empty.")]}, code="empty")

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
                raise Conflict(
                    gettext("Submitted twice at once; try again."), code="conflict"
                ) from None
            number = 1
        else:
            if not assignment.allow_resubmission:
                raise Conflict(gettext("Resubmission is not allowed."), code="no_resubmission")
            grade = getattr(submission, "grade", None)
            if grade is not None and grade.status == SubmissionGrade.Status.APPROVED:
                raise Conflict(gettext("This submission is already graded."), code="graded")
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
    # A grade the teacher approved is never replaced by the rules' suggestion (R95).
    current = SubmissionGrade.objects.select_for_update().filter(submission=submission).first()
    if current is not None and current.status == SubmissionGrade.Status.APPROVED:
        return
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
        raise ValidationError(
            {
                "score": [
                    gettext("Between 0 and %(max_grade)s.") % {"max_grade": assignment.max_grade}
                ]
            }
        )
    with transaction.atomic():
        # The submission's row is the one a resubmission locks too: the two never interleave,
        # so the rules' suggestion of a new version cannot overwrite this grade (review
        # 2026-11-15, R95).
        Submission.objects.select_for_update().filter(pk=submission.pk).first()
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
    with transaction.atomic():
        # Under the submission's lock (R95): what is approved is the suggestion that is there,
        # not one a resubmission is replacing at the same moment.
        Submission.objects.select_for_update().filter(pk=submission.pk).first()
        result = SubmissionGrade.objects.filter(submission=submission).first()
        if result is None or result.status != SubmissionGrade.Status.SUGGESTED:
            raise Conflict(
                gettext("There is no suggested grade to approve."), code="nothing_to_approve"
            )
        # docs/03 §3.9: a TA never gives final approval to an AI-suggested grade.
        if result.source == SubmissionGrade.Source.AI_SUGGESTED and _is_ta(
            meta.actor, assignment.offering
        ):
            raise PermissionDenied(gettext("Only the teacher approves AI-suggested grades."))
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
