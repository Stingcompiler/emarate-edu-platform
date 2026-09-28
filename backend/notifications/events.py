"""Automatic notifications fired by other apps (docs/02 §5.3).

Each function is called inside the caller's transaction; the fan-out runs on commit.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Category
from .services import notify, notify_audience


def lecture_published(lecture) -> None:
    offering = lecture.offering
    notify_audience(
        {"type": "offering", "ids": [offering.pk]},
        category=Category.COURSE,
        title=f"محاضرة جديدة: {lecture.title_ar}",
        body=offering.course.name_ar,
        action_url=f"/courses/{offering.public_id}/lectures/{lecture.public_id}",
    )


def assignment_published(assignment) -> None:
    offering = assignment.offering
    due = timezone.localtime(assignment.due_at).strftime("%Y-%m-%d %H:%M")
    notify_audience(
        {"type": "offering", "ids": [offering.pk]},
        category=Category.COURSE,
        title=f"واجب جديد: {assignment.title}",
        body=f"{offering.course.name_ar} · التسليم حتى {due}",
        action_url=f"/assignments/{assignment.public_id}",
    )


def grade_released(submission) -> None:
    user = submission.student_record.user
    if user is None:
        return
    grade = submission.grade
    notify(
        [user],
        category=Category.COURSE,
        title=f"تم تصحيح {submission.assignment.title}",
        body=f"الدرجة {grade.final_score} من {submission.assignment.max_grade}",
        action_url=f"/assignments/{submission.assignment.public_id}",
    )


def instructor_assigned(instructor) -> None:
    offering = instructor.offering
    notify(
        [instructor.user],
        category=Category.COURSE,
        title=f"عُيّنت على مادة {offering.course.code}",
        body=f"{offering.course.name_ar} · {offering.term.name_ar}",
        action_url=f"/courses/{offering.public_id}",
    )


def registration_pending(request) -> None:
    """Department manager/supervisor of the student's department and the head registrar."""
    from accounts.rbac import Role

    student = request.student_record
    User = get_user_model()
    approvers = User.objects.filter(
        is_active=True,
        role_assignments__role__in=[Role.DEPARTMENT_MANAGER, Role.DEPARTMENT_SUPERVISOR],
        role_assignments__department=student.department_id,
    ) | User.objects.filter(is_active=True, role_assignments__role=Role.HEAD_REGISTRAR)
    notify(
        approvers.distinct(),
        category=Category.ACCOUNT,
        title="طلب تسجيل طالب بانتظار الاعتماد",
        body=f"{student.full_name_ar} · {student.university_number}",
        action_url=f"/registration-requests/{request.public_id}",
    )


def registration_approved(user) -> None:
    notify(
        [user],
        category=Category.ACCOUNT,
        title="اعتُمد حسابك",
        body="مرحبًا بك في بوابة كلية الإمارات.",
        action_url="/",
        channels=["inapp"],
    )


def hr_notice(notice):
    return notify(
        [notice.teacher],
        category=Category.HR,
        title=notice.subject,
        body=notice.body[:500],
        action_url=f"/hr-notices/{notice.public_id}",
        kind="hr_notice",
    )


def hr_notice_copy(notice):
    """Copy to the teacher's department managers when the sender asks for it."""
    from accounts.models import RoleAssignment
    from accounts.rbac import Role

    departments = list(
        notice.teacher.department_memberships.values_list("department_id", flat=True)
    )
    managers = [
        ra.user
        for ra in RoleAssignment.objects.filter(
            role=Role.DEPARTMENT_MANAGER, department_id__in=departments
        ).select_related("user")
    ]
    return notify(
        managers,
        category=Category.HR,
        title=f"نسخة تنبيه: {notice.subject} — {notice.teacher.full_name_ar}",
        body=notice.body[:500],
        action_url=f"/hr/teachers/{notice.teacher.public_id}",
    )


def remind_due_assignments() -> int:
    from learning.models import Assignment, Submission

    now = timezone.now()
    due = Assignment.objects.filter(
        status=Assignment.Status.PUBLISHED,
        reminder_sent_at__isnull=True,
        due_at__gt=now,
        due_at__lte=now + timedelta(hours=24),
    ).select_related("offering__course")
    count = 0
    User = get_user_model()
    for assignment in due:
        submitted = Submission.objects.filter(assignment=assignment).values("student_record_id")
        students = User.objects.filter(
            is_active=True,
            student_record__enrollments__offering=assignment.offering,
            student_record__enrollments__status="active",
        ).exclude(student_record__in=submitted)
        notify(
            students,
            category=Category.COURSE,
            title=f"تذكير: موعد تسليم {assignment.title} خلال 24 ساعة",
            body=assignment.offering.course.name_ar,
            action_url=f"/assignments/{assignment.public_id}",
        )
        Assignment.objects.filter(pk=assignment.pk).update(reminder_sent_at=now)
        count += 1
    return count
