"""Throwaway review probes (2026-11-15). Each asserts the CORRECT behaviour, so it fails while
the defect exists. Never commit."""

import threading
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.db import connection
from django.utils import timezone

from academic import services as academic
from academic.models import DepartmentMembership, Enrollment, OfferingInstructor
from accounts.rbac import Role
from audit.services import RequestMeta
from core.crypto import encrypt
from learning import services as learning
from learning.models import Assignment, Submission, SubmissionGrade
from live.models import LiveSession
from notifications import services as notifications
from notifications import tasks as notification_tasks
from notifications.models import Notification, Outbox, PushSubscription

pytestmark = pytest.mark.django_db


# ─── S1: fan_out re-run ───────────────────────────────────────────────────


def test_s1_fan_out_twice_queues_one_email_and_one_push(make_user):
    user = make_user(Role.TEACHER, email="t@ecst.test")
    PushSubscription.objects.create(
        user=user, endpoint="https://push.test/1", p256dh="k", auth="a"
    )
    notification = Notification.objects.create(
        kind=Notification.Kind.SYSTEM,
        category="results",
        title="نتيجة",
        audience={"type": "users", "ids": [str(user.public_id)]},
        channels=["inapp", "push", "email"],
    )
    real_resolve = notifications.audiences.resolve
    reentered = []

    def resolve(audience):
        # A retried/duplicated task starts while the first is between its check and its write.
        if not reentered:
            reentered.append(1)
            notifications.fan_out(Notification.objects.get(pk=notification.pk))
        return real_resolve(audience)

    with (
        patch.object(notifications.audiences, "resolve", side_effect=resolve),
        patch.object(notification_tasks.send_push, "delay") as push,
        patch.object(notification_tasks.deliver_outbox, "delay"),
    ):
        notifications.fan_out(Notification.objects.get(pk=notification.pk))
    assert (Outbox.objects.filter(notification=notification).count(), push.call_count) == (1, 1)


# ─── S2: e-mail sent, transaction rolled back ────────────────────────────


class WorkerKilled(BaseException):
    """Stands for a SIGKILL / hard time limit / lost DB connection mid-batch."""


def test_s2_outbox_batch_rollback_resends_mail_already_sent():
    Outbox.objects.create(to="a@ecst.test", subject="s", body="b")
    Outbox.objects.create(to="b@ecst.test", subject="s", body="b")
    real_send = notification_tasks.send_mail
    calls = []

    def send(subject, body, from_email, to):
        calls.append(to[0])
        if len(calls) == 2:
            raise WorkerKilled
        return real_send(subject, body, from_email, to)

    with patch.object(notification_tasks, "send_mail", side_effect=send):
        with pytest.raises(WorkerKilled):
            notification_tasks.deliver_outbox()
    notification_tasks.deliver_outbox()  # the next beat run
    sent_to_a = [m for m in mail.outbox if m.to == ["a@ecst.test"]]
    assert len(sent_to_a) == 1, f"a@ received {len(sent_to_a)} copies"


# ─── S3: grading while the student resubmits ─────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_s3_teacher_grade_survives_a_concurrent_resubmission(classroom):
    if connection.vendor != "postgresql":
        pytest.skip("needs concurrent connections (PostgreSQL)")
    assignment = Assignment.objects.create(
        offering=classroom.offering,
        title="واجب",
        due_at=timezone.now() + timedelta(days=3),
        max_grade=10,
        submission_types=["text"],
        grading_mode=Assignment.GradingMode.RULE,
        rubric={"rules": [{"type": "submitted", "points": 4}]},
        status=Assignment.Status.PUBLISHED,
        created_by=classroom.teacher,
    )
    learning.submit(RequestMeta(actor=classroom.student), assignment, content="v1")
    submission = Submission.objects.get(assignment=assignment)
    real_rule = learning._rule_grade
    errors = []

    def teacher_grades():
        try:
            learning.grade(
                RequestMeta(actor=classroom.teacher),
                Submission.objects.get(pk=submission.pk),
                score=9,
            )
        except Exception as error:  # a refusal is acceptable; the final state decides
            errors.append(error)
        finally:
            connection.close()

    thread = threading.Thread(target=teacher_grades)

    def rule_grade(sub, version):
        # The teacher presses «grade» while the resubmission is between its check and its write.
        thread.start()
        thread.join(timeout=3)  # blocked here means grade() waits for the lock: correct
        return real_rule(sub, version)

    with patch.object(learning, "_rule_grade", side_effect=rule_grade):
        learning.submit(RequestMeta(actor=classroom.student), assignment, content="v2")
    thread.join()
    final = SubmissionGrade.objects.get(submission=submission)
    if not errors:
        assert (final.status, final.source) == ("approved", "manual"), (
            f"teacher's approved 9 replaced by {final.status}/{final.source} {final.score}"
        )


# ─── S4: live activity across departments ────────────────────────────────


def test_s4_teacher_report_counts_only_the_departments_sessions(
    api, make_user, it_dept, ba_program, it_offering, term
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    host = make_user(Role.TEACHER)
    it_offering.instructors.create(user=host, role="teacher")
    now = timezone.now()
    LiveSession.objects.create(  # a BA cohort session the same person hosts
        scope=LiveSession.Scope.COHORT,
        program=ba_program,
        level=1,
        title="BA",
        provider="teams",
        join_url_encrypted=encrypt("https://teams.test/ba"),
        starts_at=now - timedelta(days=1),
        ends_at=now - timedelta(days=1) + timedelta(hours=1),
        host=host,
    )
    data = api(manager).get(f"/api/v1/reports/teachers?term={term.pk}").data
    row = next(r for r in data["rows"] if r["public_id"] == str(host.public_id))
    assert (row["live_held"], row["live_planned"]) == (0, 0)


# ─── S5: enrollments across departments ──────────────────────────────────


def test_s5_department_cannot_drop_another_departments_student(
    api, make_user, make_student, it_dept, ba_program, it_offering
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    ba_student = make_student(ba_program, "26-BA-0001")
    enrollment = Enrollment.objects.create(offering=it_offering, student_record=ba_student)
    # enroll() refuses it ("This student belongs to another department")…
    other = make_student(ba_program, "26-BA-0002")
    from rest_framework.exceptions import PermissionDenied

    with pytest.raises(PermissionDenied):
        academic.enroll(RequestMeta(actor=manager), it_offering, other)
    # …so drop() should too.
    response = api(manager).post(f"/api/v1/enrollments/{enrollment.pk}/drop")
    assert response.status_code == 403, response.status_code


# ─── Sweep: add_instructor vs remove_member ──────────────────────────────


def test_sweep_removed_member_is_not_left_teaching(make_user, it_dept, it_program, it_offering):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    teacher = make_user(Role.TEACHER)
    membership = DepartmentMembership.objects.create(
        department=it_dept, program=it_program, user=teacher, kind="teacher"
    )
    real = academic.DepartmentMembership

    class Hooked:
        class objects:  # noqa: N801
            @staticmethod
            def filter(*args, **kwargs):
                qs = real.objects.filter(*args, **kwargs)

                class Q:
                    @staticmethod
                    def exists():
                        found = qs.exists()
                        # The department removes the person right after the check passed.
                        academic.remove_member(
                            RequestMeta(actor=manager), real.objects.get(pk=membership.pk)
                        )
                        return found

                return Q

    with patch.object(academic, "DepartmentMembership", Hooked):
        try:
            academic.add_instructor(RequestMeta(actor=manager), it_offering, teacher, "teacher")
        except Exception:  # noqa: S110
            pass
    assert not DepartmentMembership.objects.filter(user=teacher).exists()
    assert not OfferingInstructor.objects.filter(user=teacher, offering=it_offering).exists()
