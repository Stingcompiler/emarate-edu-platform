"""Who may do what in a course offering's learning space (docs/03 §3.7–3.10, §7).

| role                 | view drafts | edit | delete          | grade          | submit |
|----------------------|-------------|------|-----------------|----------------|--------|
| system admin         | ✔           | ✔    | ✔               | ✔              |        |
| department manager   | ✔ (dept)    | ✔    | ✔               | ✔              |        |
| department supervisor| ✔ (dept)    | ✔    |                 | ✔              |        |
| academic affairs     | ✔ (read)    |      |                 |                |        |
| teacher (assigned)   | ✔           | ✔    | own items only  | ✔              |        |
| TA (assigned)        | ✔           | ✔    |                 | if ta_can_grade|        |
| student (enrolled)   | published   |      |                 |                | ✔      |
"""

from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Q

from academic.models import Enrollment, OfferingInstructor
from accounts import rbac


@dataclass(frozen=True)
class OfferingAccess:
    view_all: bool = False  # drafts and every student's submission
    view_published: bool = False
    edit: bool = False
    delete: bool = False
    delete_own: bool = False
    grade: bool = False
    submit: bool = False
    publish: bool = False  # publish/close exams: not TAs (docs/03 §3.9)

    @property
    def any(self) -> bool:
        return self.view_all or self.view_published

    def can_delete(self, user, item) -> bool:
        return self.delete or (self.delete_own and item.created_by_id == user.pk)


def for_offering(user, offering) -> OfferingAccess:
    if user is None or not user.is_authenticated:
        return OfferingAccess()
    department_id = offering.course.department_id
    view = rbac.can(user, "learning.view", department_id)
    manage = rbac.can(user, "learning.manage", department_id)
    delete = rbac.can(user, "learning.delete", department_id)
    teaching = (
        OfferingInstructor.objects.filter(offering=offering, user=user)
        .values_list("role", flat=True)
        .first()
    )
    enrolled = Enrollment.objects.filter(
        offering=offering, student_record__user=user, status=Enrollment.Status.ACTIVE
    ).exists()
    return OfferingAccess(
        view_all=view or teaching is not None,
        view_published=view or teaching is not None or enrolled,
        edit=manage or teaching is not None,
        delete=delete,
        delete_own=teaching == "teacher",
        grade=manage or teaching == "teacher" or (teaching == "ta" and offering.ta_can_grade),
        submit=enrolled,
        publish=manage or teaching == "teacher",
    )


def staff_offerings_q(user, field: str = "offering") -> Q:
    """Offerings whose drafts ``user`` may see (department scope or teaching)."""
    scope = rbac.scope_for(user, "learning.view")
    if scope.everything:
        # Not Q(): an empty Q vanishes when OR-ed with another condition.
        return Q(**{f"{field}__isnull": False})
    teaching = OfferingInstructor.objects.filter(user=user).values("offering_id")
    q = Q(**{f"{field}_id__in": teaching})
    if scope.departments:
        q |= Q(**{f"{field}__course__department__in": scope.departments})
    return q


def student_offerings_q(user, field: str = "offering") -> Q:
    enrolled = Enrollment.objects.filter(
        student_record__user=user, status=Enrollment.Status.ACTIVE
    ).values("offering_id")
    return Q(**{f"{field}_id__in": enrolled})


# ─── File and video policies (files.access) ───────────────────────────────


def _lecture_file_readable(user, stored) -> bool:
    from .models import LectureResource

    access = for_offering(user, stored.offering)
    if access.view_all:
        return True
    return (
        access.view_published
        and LectureResource.objects.filter(file=stored, lecture__is_published=True).exists()
    )


def _submission_file_readable(user, stored) -> bool:
    # The uploader (the student) is allowed by files.access; staff see all submissions.
    return for_offering(user, stored.offering).view_all


def _video_readable(user, video) -> bool:
    from .models import LectureResource

    access = for_offering(user, video.offering)
    if access.view_all:
        return True
    return (
        access.view_published
        and LectureResource.objects.filter(video=video, lecture__is_published=True).exists()
    )


def register_file_policies() -> None:
    from files import access as files_access

    files_access.register(
        "lecture",
        files_access.Policy(
            can_upload=lambda user, offering: for_offering(user, offering).edit,
            can_read=_lecture_file_readable,
            max_mb=100,
        ),
    )
    files_access.register(
        "submission",
        files_access.Policy(
            can_upload=lambda user, offering: for_offering(user, offering).submit,
            can_read=_submission_file_readable,
            max_mb=50,
        ),
    )
    files_access.register_video(
        can_upload=lambda user, offering: for_offering(user, offering).edit,
        can_read=_video_readable,
    )
