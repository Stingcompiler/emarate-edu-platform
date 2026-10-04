"""Exams: building, permissions, server-timed attempts, grading, visibility (Phase 5)."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.rbac import Role
from exams import services
from exams.models import Exam, ExamAttempt
from exams.question_types import normalize

URL = "/api/v1/exams"
ATT = "/api/v1/exam-attempts"


def _exam_body(offering, **extra):
    now = timezone.now()
    return {
        "offering": offering.pk,
        "title": "اختبار قصير 1",
        "opens_at": (now - timedelta(minutes=5)).isoformat(),
        "closes_at": (now + timedelta(hours=2)).isoformat(),
        "duration_minutes": 30,
        "pass_marks": "3",
        **extra,
    }


QUESTIONS = [
    {
        "type": "single",
        "text": "أي هيكل يناسب LIFO؟",
        "marks": "2",
        "choices": [
            {"text": "الطابور"},
            {"text": "المكدس", "is_correct": True},
            {"text": "الشجرة"},
        ],
    },
    {
        "type": "multiple",
        "text": "اختر المشكلات",
        "marks": "2",
        "config": {"partial": True},
        "choices": [
            {"text": "إدراج", "is_correct": True},
            {"text": "حذف", "is_correct": True},
            {"text": "فهرسة"},
        ],
    },
    {"type": "true_false", "text": "المكدس LIFO", "marks": "1", "config": {"answer": True}},
    {
        "type": "fill_blank",
        "text": "المفتاح ___",
        "marks": "1",
        "config": {"accepted": ["الأجنبي", "foreign"]},
    },
    {"type": "short_answer", "text": "لماذا البحث الثنائي سريع؟", "marks": "4"},
]


@pytest.fixture
def exam(api, classroom, django_capture_on_commit_callbacks):
    """A published, open exam with one question of each type."""
    teacher = api(classroom.teacher)
    created = teacher.post(URL, _exam_body(classroom.offering, show_answers=True), format="json")
    assert created.status_code == 201, created.data
    public_id = created.data["public_id"]
    for q in QUESTIONS:
        assert teacher.post(f"{URL}/{public_id}/questions", q, format="json").status_code == 201
    with django_capture_on_commit_callbacks(execute=True):
        published = teacher.post(f"{URL}/{public_id}/publish")
    assert published.status_code == 200, published.data
    return Exam.objects.get(public_id=public_id)


def _ids(exam):
    return {q.type: q for q in exam.questions.prefetch_related("choices")}


def test_builder_permissions_and_publishing(
    api, classroom, make_user, it_dept, django_capture_on_commit_callbacks
):
    teacher, ta = api(classroom.teacher), api(classroom.ta)
    draft = teacher.post(URL, _exam_body(classroom.offering, pass_marks="1"), format="json").data[
        "public_id"
    ]
    bad = {"type": "single", "text": "بلا إجابة", "choices": [{"text": "أ"}, {"text": "ب"}]}
    assert ta.post(f"{URL}/{draft}/questions", bad, format="json").status_code == 201  # TA builds
    problems = teacher.get(f"{URL}/{draft}/problems").data["problems"]
    assert any("خيارًا صحيحًا واحدًا بالضبط" in p for p in problems)
    blocked = teacher.post(f"{URL}/{draft}/publish")
    assert blocked.status_code == 400 and blocked.data["code"] == "not_ready"
    question = classroom.offering.exams.get().questions.get()
    fixed = teacher.patch(
        f"{URL}/{draft}/questions/{question.pk}",
        {"choices": [{"text": "أ", "is_correct": True}, {"text": "ب"}]},
        format="json",
    )
    assert fixed.status_code == 200
    assert ta.post(f"{URL}/{draft}/publish").status_code == 403  # TAs never publish
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    assert api(affairs).get(f"{URL}/{draft}").status_code == 200
    assert api(affairs).patch(f"{URL}/{draft}", {"title": "x"}, format="json").status_code == 403
    assert api(classroom.student).get(f"{URL}/{draft}").status_code == 404  # drafts are hidden
    with django_capture_on_commit_callbacks(execute=True):
        assert teacher.post(f"{URL}/{draft}/publish").status_code == 200
    assert (
        api(classroom.student)
        .get("/api/v1/notifications")
        .data["results"][0]["title"]
        .startswith("اختبار جديد")
    )
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)
    assert api(supervisor).delete(f"{URL}/{draft}").status_code == 403
    assert teacher.delete(f"{URL}/{draft}").status_code == 204


def test_student_takes_the_exam(api, classroom, exam):
    student = api(classroom.student)
    started = student.post(f"{URL}/{exam.public_id}/start")
    assert started.status_code == 201, started.data
    attempt = started.data
    blob = str(attempt["questions"])
    assert "is_correct" not in blob and "accepted" not in blob and "الأجنبي" not in blob
    assert (
        student.post(f"{URL}/{exam.public_id}/start").data["public_id"] == attempt["public_id"]
    )  # resume

    q = _ids(exam)
    single_right = next(c.pk for c in q["single"].choices.all() if c.is_correct)
    multi = [c.pk for c in q["multiple"].choices.all()]
    url = f"{ATT}/{attempt['public_id']}"
    answers = {
        q["single"].pk: single_right,
        q["multiple"].pk: [multi[0], multi[2]],  # one right, one wrong → 0 partial credit
        q["true_false"].pk: True,
        q["fill_blank"].pk: "  الاجنبي ",
        q["short_answer"].pk: "لأنه ينصّف النطاق",
    }
    for qid, value in answers.items():
        assert (
            student.put(f"{url}/answers/{qid}", {"answer": value}, format="json").status_code == 204
        )
    assert (
        student.put(f"{url}/answers/{q['single'].pk}", {"answer": 999}, format="json").status_code
        == 400
    )

    submitted = student.post(f"{url}/submit")
    assert submitted.data["status"] == "submitted"
    assert student.post(f"{url}/submit").data["status"] == "submitted"  # idempotent
    row = ExamAttempt.objects.get(public_id=attempt["public_id"])
    assert row.score == Decimal("4.00") and row.passed is None  # essay awaits the teacher
    result = student.get(f"{url}/result").data
    assert result["pending_review"] == 1 and result["correct"] == 3
    assert result["review"][0]["correct_answer"] is not None
    assert student.post(f"{URL}/{exam.public_id}/start").status_code == 409  # one attempt only

    ta_grade = api(classroom.ta).post(f"{url}/answers/{q['short_answer'].pk}/grade", {"marks": "3"})
    assert ta_grade.status_code == 403
    graded = api(classroom.teacher).post(
        f"{url}/answers/{q['short_answer'].pk}/grade", {"marks": "3"}
    )
    assert (
        graded.status_code == 200
        and graded.data["score"] == "7.00"
        and graded.data["passed"] is True
    )


def test_time_limits_are_the_servers(api, classroom, exam):
    student = api(classroom.student)
    attempt = student.post(f"{URL}/{exam.public_id}/start").data
    row = ExamAttempt.objects.get(public_id=attempt["public_id"])
    row.deadline_at = timezone.now() - timedelta(seconds=exam.grace_seconds + 1)
    row.save()
    qid = exam.questions.first().pk
    late = student.put(f"{ATT}/{row.public_id}/answers/{qid}", {"answer": True}, format="json")
    assert late.status_code == 400 and late.data["code"] == "time_up"
    assert services.close_expired() == 1
    row.refresh_from_db()
    assert row.status == "auto_submitted" and row.score is not None


def test_window_and_other_courses(
    api, classroom, exam, make_user, make_student, ba_offering, ba_program
):
    from academic.models import Enrollment

    Exam.objects.filter(pk=exam.pk).update(
        opens_at=timezone.now() + timedelta(hours=1), closes_at=timezone.now() + timedelta(hours=3)
    )
    early = api(classroom.student).post(f"{URL}/{exam.public_id}/start")
    assert early.status_code == 400 and early.data["code"] == "not_open"
    outsider = make_user(Role.STUDENT)
    Enrollment.objects.create(
        offering=ba_offering, student_record=make_student(ba_program, "26-BA-0700", user=outsider)
    )
    assert api(outsider).get(f"{URL}/{exam.public_id}").status_code == 404
    assert api(outsider).post(f"{URL}/{exam.public_id}/start").status_code == 404


def test_no_backtrack_and_shuffle(api, classroom, exam):
    Exam.objects.filter(pk=exam.pk).update(
        allow_backtrack=False, shuffle_questions=True, shuffle_choices=True
    )
    student = api(classroom.student)
    attempt = student.post(f"{URL}/{exam.public_id}/start").data
    order = [q["id"] for q in attempt["questions"]]
    assert sorted(order) == sorted(exam.questions.values_list("pk", flat=True))
    url = f"{ATT}/{attempt['public_id']}/answers"
    assert student.put(f"{url}/{order[1]}", {"answer": None}, format="json").status_code == 204
    back = student.put(f"{url}/{order[0]}", {"answer": None}, format="json")
    assert back.status_code == 400 and back.data["code"] == "no_backtrack"


def test_visibility_modes(api, classroom, exam):
    Exam.objects.filter(pk=exam.pk).update(result_visibility="manual")
    student = api(classroom.student)
    attempt = student.post(f"{URL}/{exam.public_id}/start").data
    student.post(f"{ATT}/{attempt['public_id']}/submit")
    assert student.get(f"{ATT}/{attempt['public_id']}/result").status_code == 404
    assert (
        api(classroom.ta).post(f"{URL}/{exam.public_id}/release", {"released": True}).status_code
        == 403
    )
    assert (
        api(classroom.teacher)
        .post(f"{URL}/{exam.public_id}/release", {"released": True})
        .status_code
        == 200
    )
    assert student.get(f"{ATT}/{attempt['public_id']}/result").status_code == 200


def test_monitor_extend_reopen_invalidate_and_stats(api, classroom, exam):
    student = api(classroom.student)
    attempt = student.post(f"{URL}/{exam.public_id}/start").data
    url = f"{ATT}/{attempt['public_id']}"
    teacher = api(classroom.teacher)
    monitor = teacher.get(f"{URL}/{exam.public_id}/attempts").data["results"]
    assert monitor[0]["status"] == "in_progress" and monitor[0]["remaining_seconds"] > 0
    # The monitor's figures come from the server, one state at a time (review 2026-09-29, P3).
    by_state = {
        s: teacher.get(f"{URL}/{exam.public_id}/attempts", {"state": s, "page_size": 1}).data[
            "count"
        ]
        for s in ("in_progress", "done", "invalidated")
    }
    assert by_state == {"in_progress": 1, "done": 0, "invalidated": 0}
    assert student.get(f"{URL}/{exam.public_id}/attempts").status_code == 403
    before = ExamAttempt.objects.get(public_id=attempt["public_id"]).deadline_at
    assert teacher.post(f"{url}/extend", {"minutes": 5}).status_code == 200
    assert ExamAttempt.objects.get(
        public_id=attempt["public_id"]
    ).deadline_at == before + timedelta(minutes=5)
    student.post(f"{url}/signals", {"kind": "blur"})
    assert ExamAttempt.objects.get(public_id=attempt["public_id"]).client_meta == {"blur": 1}
    student.post(f"{url}/submit")
    assert teacher.post(f"{url}/reopen", {"minutes": 10, "reason": ""}).status_code == 400
    assert (
        api(classroom.ta).post(f"{url}/reopen", {"minutes": 10, "reason": "انقطاع"}).status_code
        == 403
    )
    assert (
        teacher.post(f"{url}/reopen", {"minutes": 10, "reason": "انقطاع الكهرباء"}).data["status"]
        == "in_progress"
    )
    student.post(f"{url}/submit")
    assert teacher.post(f"{url}/invalidate", {"reason": "بلاغ غش"}).data["status"] == "invalidated"
    stats = teacher.get(f"{URL}/{exam.public_id}/stats").data
    assert stats["students"] == 1 and len(stats["questions"]) == 5


def test_questions_lock_once_students_start(api, classroom, exam):
    api(classroom.student).post(f"{URL}/{exam.public_id}/start")
    question = exam.questions.first()
    locked = api(classroom.teacher).patch(
        f"{URL}/{exam.public_id}/questions/{question.pk}", {"text": "تعديل"}, format="json"
    )
    assert locked.status_code == 409
    assert api(classroom.teacher).delete(f"{URL}/{exam.public_id}").status_code == 409


def test_misconduct_report_can_link_an_attempt(api, classroom, exam):
    attempt = api(classroom.student).post(f"{URL}/{exam.public_id}/start").data
    body = {
        "offering": classroom.offering.pk,
        "student_record": str(classroom.record.public_id),
        "attempt": attempt["public_id"],
        "evidence": "تطابق إجابات",
    }
    report = api(classroom.teacher).post("/api/v1/misconduct-reports", body, format="json")
    assert report.status_code == 201, report.data
    assert str(report.data["attempt"]) == str(attempt["public_id"])


def test_arabic_answers_are_normalized():
    assert normalize("  الأجْنبيّ ") == normalize("الاجنبي")
    assert normalize("مدرسة") == normalize("مدرسه")


def test_close_submits_running_attempts(api, classroom, exam):
    attempt = api(classroom.student).post(f"{URL}/{exam.public_id}/start").data
    assert api(classroom.ta).post(f"{URL}/{exam.public_id}/close").status_code == 403
    assert api(classroom.teacher).post(f"{URL}/{exam.public_id}/close").data["status"] == "closed"
    assert ExamAttempt.objects.get(public_id=attempt["public_id"]).status == "auto_submitted"


def test_reorder_questions(api, classroom):
    teacher = api(classroom.teacher)
    exam = teacher.post(URL, _exam_body(classroom.offering), format="json").data["public_id"]
    ids = [
        teacher.post(f"{URL}/{exam}/questions", q, format="json").data["id"] for q in QUESTIONS[:3]
    ]
    assert (
        teacher.post(f"{URL}/{exam}/questions-order", {"order": ids[:2]}, format="json").status_code
        == 400
    )
    assert (
        teacher.post(
            f"{URL}/{exam}/questions-order", {"order": list(reversed(ids))}, format="json"
        ).status_code
        == 204
    )
    assert [q["id"] for q in teacher.get(f"{URL}/{exam}/questions").data] == list(reversed(ids))
    from audit.models import AuditLog

    assert AuditLog.objects.filter(action="exam.reorder").count() == 1  # the refused one is not


def test_the_monitor_counts_who_has_not_started(api, classroom, exam):
    """Review 2026-09-29 PR 7: «لم يبدأ» = enrolled students without an attempt."""
    teacher = api(classroom.teacher)
    detail = teacher.get(f"{URL}/{exam.public_id}").data
    enrolled = detail["students_count"]
    assert enrolled >= 1 and detail["started_count"] == 0
    api(classroom.student).post(f"{URL}/{exam.public_id}/start")
    assert teacher.get(f"{URL}/{exam.public_id}").data["started_count"] == 1
    # Lists and students don't get (or pay for) the figures.
    listed = next(
        e for e in teacher.get(URL).data["results"] if e["public_id"] == str(exam.public_id)
    )
    assert listed["students_count"] is None
    assert api(classroom.student).get(f"{URL}/{exam.public_id}").data["students_count"] is None


def test_a_save_that_loses_the_race_to_submit_is_refused(classroom, exam):
    """Review 2026-10-04 C1: an autosave read before the submit committed must not change the
    graded answer afterwards (it was saved, while the mark stayed on the old answer)."""
    from audit.services import RequestMeta
    from core.errors import Conflict

    meta = RequestMeta(actor=classroom.student)
    attempt = services.start(meta, exam)
    stale = ExamAttempt.objects.get(pk=attempt.pk)  # the autosave request's copy
    question = exam.questions.get(type="true_false")
    services.save_answer(meta, attempt, question.pk, True)
    done = services.submit(meta, attempt)
    with pytest.raises(Conflict):
        services.save_answer(meta, stale, question.pk, False)
    answer = done.answers.get(question=question)
    assert answer.answer is True and answer.marks_awarded == Decimal("1")


def test_teacher_actions_recheck_the_attempt_they_act_on(api, classroom, exam, make_user):
    """Extend and reopen re-read the attempt under the lock (C8): a stale copy cannot extend a
    submitted attempt or reopen one twice."""
    from audit.services import RequestMeta
    from core.errors import Conflict

    meta = RequestMeta(actor=classroom.student)
    attempt = services.start(meta, exam)
    stale = ExamAttempt.objects.get(pk=attempt.pk)
    services.submit(meta, attempt)
    teacher = RequestMeta(actor=classroom.teacher)
    with pytest.raises(Conflict):
        services.extend(teacher, stale, 10)  # still "in progress" in the stale copy
    reopened = services.reopen(teacher, ExamAttempt.objects.get(pk=attempt.pk), 10, "انقطاع")
    with pytest.raises(Conflict):
        services.reopen(teacher, stale, 10, "مرة ثانية")  # stale copy says "submitted"
    assert ExamAttempt.objects.get(pk=reopened.pk).status == "in_progress"
