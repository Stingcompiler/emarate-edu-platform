"""Review 2026-11-15, fix 3 (R95–R98): two writes at the same moment end as if one came
after the other — a grade, an assignment, a notification's fan-out, a batch of e-mail."""

import threading
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.db import connection, transaction
from django.utils import timezone

from academic import services as academic
from academic.models import DepartmentMembership, OfferingInstructor
from accounts.rbac import Role
from audit.services import RequestMeta
from learning import services as learning
from learning.models import Assignment, Submission, SubmissionGrade
from notifications import services as notifications
from notifications import tasks as notification_tasks
from notifications.models import Notification, Outbox, PushSubscription

pytestmark = pytest.mark.django_db

needs_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql", reason="needs concurrent connections (PostgreSQL)"
)


# ─── R96: the fan-out runs twice at once ────────────────────────────────────────────────


def test_a_fan_out_run_twice_at_once_sends_once(make_user):
    user = make_user(Role.TEACHER, email="t@ecst.test")
    PushSubscription.objects.create(user=user, endpoint="https://push.test/1", p256dh="k", auth="a")
    notification = Notification.objects.create(
        kind=Notification.Kind.SYSTEM,
        category="results",
        title="نتيجة",
        audience={"type": "users", "ids": [str(user.public_id)]},
        channels=["inapp", "push", "email"],
    )
    real_resolve = notifications.audiences.resolve
    again = []

    def resolve(audience):
        # A redelivered task starts while the first is between its check and its write.
        if not again:
            again.append(1)
            notifications.fan_out(Notification.objects.get(pk=notification.pk))
        return real_resolve(audience)

    with (
        patch.object(notifications.audiences, "resolve", side_effect=resolve),
        patch.object(notification_tasks.send_push, "delay") as push,
        patch.object(notification_tasks.deliver_outbox, "delay"),
    ):
        notifications.fan_out(Notification.objects.get(pk=notification.pk))
    assert Outbox.objects.filter(notification=notification).count() == 1
    assert push.call_count == 1


# ─── R97: the worker stops in the middle of a batch of e-mail ──────────────────────────


class WorkerKilled(BaseException):
    """Stands for a killed worker or a hard time limit in the middle of the batch."""


def test_a_batch_cut_short_resends_none_of_what_went(settings):
    Outbox.objects.create(to="a@ecst.test", subject="s", body="b")
    Outbox.objects.create(to="b@ecst.test", subject="s", body="b")
    real_send = notification_tasks.send_mail
    calls = []

    def send(subject, body, from_email, to):
        calls.append(to[0])
        if len(calls) == 2:
            raise WorkerKilled
        return real_send(subject, body, from_email, to)

    with (
        patch.object(notification_tasks, "send_mail", side_effect=send),
        pytest.raises(WorkerKilled),
    ):
        notification_tasks.deliver_outbox()
    # The next beat run: the one that went is not sent again; the one cut short waits for its
    # claim to end, then goes.
    assert notification_tasks.deliver_outbox() == 0
    Outbox.objects.filter(to="b@ecst.test").update(next_try_at=timezone.now())
    assert notification_tasks.deliver_outbox() == 1
    assert [m.to for m in mail.outbox] == [["a@ecst.test"], ["b@ecst.test"]]
    assert set(Outbox.objects.values_list("status", flat=True)) == {Outbox.Status.SENT}


def test_an_email_cancelled_after_it_was_claimed_is_not_sent():
    row = Outbox.objects.create(to="a@ecst.test", subject="s", body="b")
    real_update = Outbox.objects.bulk_update

    def claimed_then_hidden(rows, fields, **kwargs):
        real_update(rows, fields, **kwargs)
        # Its notification is hidden by the sender between the claim and the sending (R81).
        Outbox.objects.filter(pk=row.pk).update(status=Outbox.Status.CANCELLED)

    with patch.object(Outbox.objects, "bulk_update", side_effect=claimed_then_hidden):
        assert notification_tasks.deliver_outbox() == 0
    assert mail.outbox == []
    row.refresh_from_db()
    assert row.status == Outbox.Status.CANCELLED


# ─── R95: the teacher grades while the student resubmits ───────────────────────────────


@needs_postgres
@pytest.mark.django_db(transaction=True)
def test_a_teachers_grade_survives_a_resubmission_at_the_same_moment(classroom):
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

    def teacher_grades():
        try:
            learning.grade(
                RequestMeta(actor=classroom.teacher),
                Submission.objects.get(pk=submission.pk),
                score=9,
            )
        finally:
            connection.close()

    thread = threading.Thread(target=teacher_grades)

    def rule_grade(sub, version):
        # «رصد» is pressed while the resubmission is between its check and its write: it
        # waits for the submission's lock.
        thread.start()
        thread.join(timeout=2)
        assert thread.is_alive(), "grade() did not wait for the resubmission"
        return real_rule(sub, version)

    with patch.object(learning, "_rule_grade", side_effect=rule_grade):
        learning.submit(RequestMeta(actor=classroom.student), assignment, content="v2")
    thread.join()
    final = SubmissionGrade.objects.get(submission=submission)
    assert (final.status, final.source, final.score) == ("approved", "manual", 9)


def test_the_rules_never_replace_an_approved_grade(classroom):
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
    learning.grade(RequestMeta(actor=classroom.teacher), submission, score=9)
    learning._rule_grade(submission, submission.current_version)
    final = SubmissionGrade.objects.get(submission=submission)
    assert (final.status, final.score) == ("approved", 9)


# ─── R98: the person is removed while being assigned ───────────────────────────────────


@needs_postgres
@pytest.mark.django_db(transaction=True)
def test_a_person_removed_while_being_assigned_is_not_left_teaching(
    make_user, it_dept, it_program, it_offering
):
    from django.core.exceptions import ValidationError
    from rest_framework.exceptions import ValidationError as APIValidationError

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    teacher = make_user(Role.TEACHER)
    membership = DepartmentMembership.objects.create(
        department=it_dept, program=it_program, user=teacher, kind="teacher"
    )
    outcome = []

    def assign():
        try:
            academic.add_instructor(RequestMeta(actor=manager), it_offering, teacher, "teacher")
            outcome.append("assigned")
        except (ValidationError, APIValidationError):
            outcome.append("refused")
        finally:
            connection.close()

    thread = threading.Thread(target=assign)
    with transaction.atomic():
        # The department removes the person; the assignment starts before that is committed.
        academic.remove_member(RequestMeta(actor=manager), membership)
        thread.start()
        thread.join(timeout=2)
        assert thread.is_alive(), "add_instructor did not wait for the membership's lock"
    thread.join()
    assert outcome == ["refused"]
    assert not OfferingInstructor.objects.filter(user=teacher, offering=it_offering).exists()
