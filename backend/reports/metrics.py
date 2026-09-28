"""Read-only report builders (docs/02 §4.14).

Every builder runs a fixed number of queries whatever the size of the data
(no N+1): rows are fetched with ``values``/``values_list`` and combined in
Python. Callers pass an ``rbac.Scope``; nothing outside it is read.

Grading time is measured from max(first submission, due date) to the approved
grade. Submissions still waiting count with their age so far, so a backlog
shows up in the average instead of hiding until it is graded.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import timedelta
from statistics import mean

from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Min, Q
from django.utils import timezone

from academic.models import (
    CourseOffering,
    DepartmentMembership,
    Enrollment,
    OfferingInstructor,
    Term,
)
from accounts.models import RoleAssignment
from accounts.rbac import Role, Scope
from exams.models import Exam
from learning.models import Assignment, Lecture, Submission, SubmissionGrade
from live.models import LiveSession
from organization.models import Department, SystemSettings
from students.models import StudentRecord

STATUS_ORDER = {"below": 0, "warn": 1, "ok": 2, "none": 3}


# ─── Terms ────────────────────────────────────────────────────────────────


def current_term() -> Term | None:
    return (
        Term.objects.filter(is_current=True).first() or Term.objects.order_by("-starts_on").first()
    )


def previous_term(term: Term) -> Term | None:
    return Term.objects.filter(starts_on__lt=term.starts_on).order_by("-starts_on").first()


def weeks_elapsed(term: Term, now=None) -> int:
    """Teaching weeks started so far (the whole term once it has ended)."""
    today = timezone.localdate(now or timezone.now())
    end = min(today, term.ends_on)
    if end < term.starts_on:
        return 0
    total = math.ceil(((term.ends_on - term.starts_on).days + 1) / 7)
    return min(total, math.ceil(((end - term.starts_on).days + 1) / 7))


def _percent(part: int, whole: int) -> int | None:
    return round(100 * part / whole) if whole else None


def _avg(values: list[float]) -> float | None:
    return round(mean(values), 1) if values else None


def thresholds() -> dict:
    config = SystemSettings.load()
    return {
        "grading_days": config.grading_days_limit,
        "upload_percent": config.upload_min_percent,
        "lectures_per_week": config.planned_lectures_per_week,
    }


# ─── Per-offering facts ───────────────────────────────────────────────────


def _offering_stats(offering_ids, now) -> dict[int, dict]:
    stats = {
        oid: {
            "students": 0,
            "lectures": 0,
            "lectures_30d": 0,
            "last_upload": None,
            "assignments": 0,
            "assignments_due": 0,
            "exams": 0,
            "submissions": 0,
            "ungraded": 0,
            "delays": [],
        }
        for oid in offering_ids
    }
    if not stats:
        return stats
    ids = list(stats)
    enrolled = (
        Enrollment.objects.filter(offering_id__in=ids, status=Enrollment.Status.ACTIVE)
        .values("offering_id")
        .annotate(n=Count("id"))
        .order_by()
    )
    for row in enrolled:
        stats[row["offering_id"]]["students"] = row["n"]
    since = now - timedelta(days=30)
    lectures = (
        Lecture.objects.filter(offering_id__in=ids, is_published=True)
        .values("offering_id")
        .annotate(
            n=Count("id"),
            last=Max("published_at"),
            recent=Count("id", filter=Q(published_at__gte=since)),
        )
        .order_by()
    )
    for row in lectures:
        entry = stats[row["offering_id"]]
        entry.update(lectures=row["n"], last_upload=row["last"], lectures_30d=row["recent"])
    assignments = (
        Assignment.objects.filter(
            offering_id__in=ids,
            status__in=[Assignment.Status.PUBLISHED, Assignment.Status.CLOSED],
        )
        .values("offering_id")
        .annotate(n=Count("id"), due=Count("id", filter=Q(due_at__lte=now)))
        .order_by()
    )
    for row in assignments:
        stats[row["offering_id"]].update(assignments=row["n"], assignments_due=row["due"])
    exams = (
        Exam.objects.filter(offering_id__in=ids)
        .exclude(status=Exam.Status.DRAFT)
        .values("offering_id")
        .annotate(n=Count("id"))
        .order_by()
    )
    for row in exams:
        stats[row["offering_id"]]["exams"] = row["n"]
    submissions = Submission.objects.filter(assignment__offering_id__in=ids).values_list(
        "assignment__offering_id",
        "first_submitted_at",
        "assignment__due_at",
        "grade__status",
        "grade__graded_at",
    )
    for oid, submitted, due, grade_status, graded_at in submissions:
        entry = stats[oid]
        entry["submissions"] += 1
        start = max(submitted, due) if due else submitted
        if grade_status == SubmissionGrade.Status.APPROVED and graded_at:
            entry["delays"].append(max(0.0, (graded_at - start).total_seconds() / 86400))
        else:
            entry["ungraded"] += 1
            if start <= now:
                entry["delays"].append((now - start).total_seconds() / 86400)
    return stats


def _live(term: Term, offering_ids, host_ids, now) -> tuple[dict, dict]:
    """(held, planned) per host and per offering; cancelled sessions don't count."""
    per_host: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    per_offering: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    sessions = (
        LiveSession.objects.exclude(status=LiveSession.Status.CANCELLED)
        .filter(
            Q(offering_id__in=list(offering_ids))
            | Q(
                offering__isnull=True,
                host_id__in=list(host_ids),
                starts_at__date__gte=term.starts_on,
                starts_at__date__lte=term.ends_on,
            )
        )
        .values_list("host_id", "offering_id", "starts_at")
    )
    for host, oid, starts in sessions:
        held = 1 if starts <= now else 0
        per_host[host][0] += held
        per_host[host][1] += 1
        if oid is not None:
            per_offering[oid][0] += held
            per_offering[oid][1] += 1
    return per_host, per_offering


# ─── Teachers ─────────────────────────────────────────────────────────────


def status_of(row: dict, limits: dict) -> str:
    if not row["offerings"]:
        return "none"
    grading, upload = row["grading_days"], row["upload_percent"]
    ungraded = row["ungraded_percent"]
    if (grading is not None and grading > limits["grading_days"] + 2) or (
        upload is not None and upload < limits["upload_percent"] - 25
    ):
        return "below"
    if (
        (grading is not None and grading > limits["grading_days"])
        or (upload is not None and upload < limits["upload_percent"])
        or (ungraded is not None and ungraded > 25)
    ):
        return "warn"
    return "ok"


def teacher_rows(
    term: Term,
    scope: Scope,
    *,
    department_id: int | None = None,
    kind: str | None = None,
    user_ids: set[int] | None = None,
    now=None,
) -> list[dict]:
    """One row per teacher/TA in scope with this term's indicators."""
    now = now or timezone.now()
    limits = thresholds()
    offerings = scope.filter(
        CourseOffering.objects.filter(term=term).exclude(status=CourseOffering.Status.DRAFT),
        "course__department_id",
    )
    offering_dept = dict(offerings.values_list("id", "course__department_id"))
    # A TA answers for grading only where the teacher allowed it (docs/03 §3.9).
    ta_grades = set(offerings.filter(ta_can_grade=True).values_list("id", flat=True))
    teaching = OfferingInstructor.objects.filter(offering_id__in=list(offering_dept))
    members = scope.filter(DepartmentMembership.objects.all(), "department_id")
    if user_ids is not None:
        teaching = teaching.filter(user_id__in=user_ids)
        members = members.filter(user_id__in=user_ids)
    by_user: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for user_id, offering_id, role in teaching.values_list("user_id", "offering_id", "role"):
        by_user[user_id].append((offering_id, role))
    home: dict[int, tuple[int, str]] = {}
    for user_id, dept_id, member_kind in members.order_by("id").values_list(
        "user_id", "department_id", "kind"
    ):
        home.setdefault(user_id, (dept_id, member_kind))
    ids = set(by_user) | set(home)
    if not ids:
        return []
    stats = _offering_stats(list(offering_dept), now)
    live_host, _ = _live(term, offering_dept, ids, now)
    planned_each = weeks_elapsed(term, now) * limits["lectures_per_week"]
    users = {
        u["id"]: u
        for u in get_user_model()
        .objects.filter(id__in=ids)
        .values("id", "public_id", "full_name_ar", "is_active")
    }
    admin_roles = dict(
        RoleAssignment.objects.filter(
            user_id__in=ids, role__in=[Role.DEPARTMENT_MANAGER, Role.DEPARTMENT_SUPERVISOR]
        ).values_list("user_id", "role")
    )
    departments = dict(Department.objects.values_list("id", "name_ar"))
    rows = []
    for user_id in ids:
        user = users.get(user_id)
        if user is None or not user["is_active"]:
            continue
        assigned = by_user.get(user_id, [])
        is_teacher = any(role == OfferingInstructor.Kind.TEACHER for _, role in assigned)
        member_kind = home.get(user_id, (None, None))[1]
        row_kind = "teacher" if is_teacher or (not assigned and member_kind != "ta") else "ta"
        dept_id = home.get(user_id, (None,))[0] or (
            offering_dept[assigned[0][0]] if assigned else None
        )
        if department_id is not None and dept_id != department_id:
            continue
        if kind is not None and row_kind != kind:
            continue
        taught = [stats[oid] for oid, _ in assigned]
        lead = [stats[oid] for oid, role in assigned if role == OfferingInstructor.Kind.TEACHER]
        grading = [
            stats[oid]
            for oid, role in assigned
            if role == OfferingInstructor.Kind.TEACHER or oid in ta_grades
        ]
        delays = [d for s in grading for d in s["delays"]]
        submissions = sum(s["submissions"] for s in grading)
        ungraded = sum(s["ungraded"] for s in grading)
        lectures = sum(s["lectures"] for s in lead)
        planned = planned_each * len(lead)
        held, scheduled = live_host.get(user_id, (0, 0))
        row = {
            "id": user_id,
            "public_id": str(user["public_id"]),
            "name": user["full_name_ar"],
            "department_id": dept_id,
            "department": departments.get(dept_id, ""),
            "kind": row_kind,
            "admin_role": admin_roles.get(user_id),
            "offerings": len(assigned),
            "students": sum(s["students"] for s in taught),
            "lectures": lectures if lead else None,
            "planned": planned if lead else None,
            "upload_percent": min(100, _percent(lectures, planned)) if lead and planned else None,
            "assignments": sum(s["assignments"] for s in lead) if lead else None,
            "exams": sum(s["exams"] for s in lead) if lead else None,
            "grading_days": _avg(delays),
            "ungraded": ungraded,
            "ungraded_percent": _percent(ungraded, submissions),
            "live_held": held,
            "live_planned": scheduled,
        }
        row["status"] = status_of(row, limits)
        rows.append(row)
    rows.sort(key=lambda r: (STATUS_ORDER[r["status"]], r["name"]))
    return rows


def rollup(rows: list[dict]) -> list[dict]:
    """Per-department summary of teacher rows."""
    groups: dict[int | None, list[dict]] = defaultdict(list)
    for row in rows:
        groups[row["department_id"]].append(row)
    out = []
    for dept_id, members in groups.items():
        out.append(
            {
                "department_id": dept_id,
                "department": members[0]["department"],
                "members": len(members),
                "grading_days": _avg(
                    [r["grading_days"] for r in members if r["grading_days"] is not None]
                ),
                "upload_percent": _avg(
                    [r["upload_percent"] for r in members if r["upload_percent"] is not None]
                ),
                "live_held": sum(r["live_held"] for r in members),
                "live_planned": sum(r["live_planned"] for r in members),
                "below": sum(1 for r in members if r["status"] == "below"),
            }
        )
    out.sort(key=lambda d: d["department"])
    return out


def _summary(rows: list[dict]) -> dict:
    counts = {key: 0 for key in STATUS_ORDER}
    for row in rows:
        counts[row["status"]] += 1
    return {
        "members": len(rows),
        "counts": counts,
        "grading_days": _avg([r["grading_days"] for r in rows if r["grading_days"] is not None]),
        "upload_percent": _avg(
            [r["upload_percent"] for r in rows if r["upload_percent"] is not None]
        ),
    }


def teachers_report(term: Term, scope: Scope, *, department_id=None, kind=None, now=None) -> dict:
    rows = teacher_rows(term, scope, department_id=department_id, kind=kind, now=now)
    before = previous_term(term)
    previous = None
    if before is not None:
        previous = _summary(
            teacher_rows(before, scope, department_id=department_id, kind=kind, now=now)
        )
        previous["term"] = before.name_ar
    return {
        "term": {"id": term.id, "name": term.name_ar, "week": weeks_elapsed(term, now)},
        "thresholds": thresholds(),
        "summary": _summary(rows),
        "previous": previous,
        "departments": rollup(rows),
        "rows": [{k: v for k, v in r.items() if k != "id"} for r in rows],
    }


# ─── Department ───────────────────────────────────────────────────────────


def _department_facts(term: Term, dept_ids: list[int], now) -> tuple[list, dict, dict]:
    offerings = list(
        CourseOffering.objects.filter(term=term, course__department_id__in=dept_ids)
        .exclude(status=CourseOffering.Status.DRAFT)
        .select_related("course")
    )
    ids = [o.id for o in offerings]
    stats = _offering_stats(ids, now)
    _, live = _live(term, ids, [], now)
    teachers: dict[int, list[str]] = defaultdict(list)
    for oid, name in OfferingInstructor.objects.filter(
        offering_id__in=ids, role=OfferingInstructor.Kind.TEACHER
    ).values_list("offering_id", "user__full_name_ar"):
        teachers[oid].append(name)
    return offerings, stats, {"teachers": teachers, "live": live}


def _kpis(offerings, stats, extra, planned_each) -> dict:
    count = len(offerings)
    delays = [d for s in stats.values() for d in s["delays"]]
    expected = sum(s["students"] * s["assignments_due"] for s in stats.values())
    lectures = sum(s["lectures"] for s in stats.values())
    return {
        "offerings": count,
        "without_teacher": sum(1 for o in offerings if not extra["teachers"].get(o.id)),
        "lectures": lectures,
        "lectures_30d": sum(s["lectures_30d"] for s in stats.values()),
        "lectures_per_offering": round(lectures / count, 1) if count else None,
        "upload_percent": _percent(lectures, planned_each * count) if planned_each else None,
        "grading_days": _avg(delays),
        "submission_percent": _percent(sum(s["submissions"] for s in stats.values()), expected),
        "live_held": sum(held for held, _ in extra["live"].values()),
    }


def department_report(term: Term, dept_ids: list[int], now=None) -> dict:
    now = now or timezone.now()
    limits = thresholds()
    planned_each = weeks_elapsed(term, now) * limits["lectures_per_week"]
    offerings, stats, extra = _department_facts(term, dept_ids, now)
    kpis = _kpis(offerings, stats, extra, planned_each)
    students = StudentRecord.objects.filter(
        department_id__in=dept_ids, status=StudentRecord.Status.ACTIVE
    )
    total = students.count()
    enrolled = (
        students.filter(
            enrollments__offering__term=term, enrollments__status=Enrollment.Status.ACTIVE
        )
        .distinct()
        .count()
    )
    kpis.update(students=total, enrolled_percent=_percent(enrolled, total))
    rows = []
    for o in offerings:
        s = stats[o.id]
        expected = s["students"] * s["assignments_due"]
        rows.append(
            {
                "public_id": str(o.public_id),
                "code": o.course.code,
                "name": o.course.name_ar,
                "section": o.section,
                "level": o.course.default_level,
                "teachers": extra["teachers"].get(o.id, []),
                "students": s["students"],
                "lectures": s["lectures"],
                "planned": planned_each,
                "submission_percent": _percent(s["submissions"], expected),
                "ungraded": s["ungraded"],
                "last_upload": s["last_upload"],
            }
        )
    # Least uploaded first: that's what a department head acts on.
    rows.sort(key=lambda r: (r["lectures"], r["code"]))
    today = timezone.localdate(now)
    weekly = [0] * 8
    for published in Lecture.objects.filter(
        offering_id__in=[o.id for o in offerings],
        is_published=True,
        published_at__gte=now - timedelta(days=56),
    ).values_list("published_at", flat=True):
        weeks_ago = (today - timezone.localdate(published)).days // 7
        if 0 <= weeks_ago < 8:
            weekly[7 - weeks_ago] += 1
    before = previous_term(term)
    previous = None
    if before is not None:
        p_offerings, p_stats, p_extra = _department_facts(before, dept_ids, now)
        previous = _kpis(
            p_offerings,
            p_stats,
            p_extra,
            weeks_elapsed(before, now) * limits["lectures_per_week"],
        )
        previous["term"] = before.name_ar
    names = list(Department.objects.filter(id__in=dept_ids).values_list("name_ar", flat=True))
    return {
        "term": {"id": term.id, "name": term.name_ar, "week": weeks_elapsed(term, now)},
        "departments": names,
        "thresholds": limits,
        "kpis": kpis,
        "previous": previous,
        "weekly_uploads": weekly,
        "rows": rows,
    }


# ─── Admissions ───────────────────────────────────────────────────────────


def admissions_report(cycle, *, department_id: int | None = None, now=None) -> dict:
    from admissions.models import (
        AdmissionCycle,
        Application,
        ApplicationStatusHistory,
    )
    from inquiries.models import Inquiry

    now = now or timezone.now()
    S = Application.Status
    apps = Application.objects.filter(intake__cycle=cycle).exclude(status=S.DRAFT)
    if department_id is not None:
        apps = apps.filter(intake__program__department_id=department_id)
    by_status: dict[str, int] = defaultdict(int)
    programs: dict[int, dict] = {}
    for row in (
        apps.values(
            "status",
            "intake__program_id",
            "intake__program__name_ar",
            "intake__program__department__name_ar",
        )
        .annotate(n=Count("id"))
        .order_by()
    ):
        by_status[row["status"]] += row["n"]
        entry = programs.setdefault(
            row["intake__program_id"],
            {
                "program": row["intake__program__name_ar"],
                "department": row["intake__program__department__name_ar"],
                "total": 0,
                "by_status": {},
            },
        )
        entry["total"] += row["n"]
        entry["by_status"][row["status"]] = row["n"]
    total = sum(by_status.values())
    converted = by_status.get(S.REGISTERED, 0) + by_status.get(S.ACTIVATED, 0)
    accepted = by_status.get(S.ACCEPTED, 0) + converted
    facts = list(apps.values_list("id", "submitted_at", "assigned_registrar_id"))
    first_reply = dict(
        ApplicationStatusHistory.objects.filter(
            application_id__in=[f[0] for f in facts], changed_by__isnull=False
        )
        .values("application_id")
        .annotate(first=Min("at"))
        .order_by()
        .values_list("application_id", "first")
    )
    replies_all: list[float] = []
    by_registrar: dict[int, dict] = defaultdict(lambda: {"applications": 0, "replies": []})
    for app_id, submitted, registrar in facts:
        reply = first_reply.get(app_id)
        days = (reply - submitted).total_seconds() / 86400 if reply and submitted else None
        if days is not None:
            replies_all.append(max(0.0, days))
        if registrar is not None:
            by_registrar[registrar]["applications"] += 1
            if days is not None:
                by_registrar[registrar]["replies"].append(max(0.0, days))
    decisions = dict(
        ApplicationStatusHistory.objects.filter(
            application__in=apps,
            to_status__in=[S.ACCEPTED, S.REJECTED, S.WAITLISTED],
            changed_by__isnull=False,
        )
        .values("changed_by_id")
        .annotate(n=Count("id"))
        .order_by()
        .values_list("changed_by_id", "n")
    )
    registrar_ids = set(by_registrar) | set(
        RoleAssignment.objects.filter(role=Role.REGISTRAR).values_list("user_id", flat=True)
    )
    names = dict(
        get_user_model()
        .objects.filter(id__in=registrar_ids, is_active=True)
        .values_list("id", "full_name_ar")
    )
    depts: dict[int, list[str]] = defaultdict(list)
    for user_id, code in RoleAssignment.objects.filter(
        role=Role.REGISTRAR, user_id__in=registrar_ids
    ).values_list("user_id", "department__code"):
        if code:
            depts[user_id].append(code)
    late = dict(
        Inquiry.objects.filter(
            assigned_to_id__in=registrar_ids,
            status__in=[Inquiry.Status.NEW, Inquiry.Status.IN_PROGRESS],
            created_at__lt=now - timedelta(days=2),
        )
        .values("assigned_to_id")
        .annotate(n=Count("id"))
        .order_by()
        .values_list("assigned_to_id", "n")
    )
    registrars = [
        {
            "name": names[user_id],
            "departments": sorted(depts.get(user_id, [])),
            "applications": by_registrar[user_id]["applications"] if user_id in by_registrar else 0,
            "first_reply_days": _avg(by_registrar[user_id]["replies"])
            if user_id in by_registrar
            else None,
            "late_inquiries": late.get(user_id, 0),
            "decisions": decisions.get(user_id, 0),
        }
        for user_id in registrar_ids
        if user_id in names
    ]
    registrars.sort(key=lambda r: (-r["applications"], r["name"]))
    today = timezone.localdate(now)
    daily = [0] * 10
    for submitted in apps.filter(submitted_at__gte=now - timedelta(days=10)).values_list(
        "submitted_at", flat=True
    ):
        days_ago = (today - timezone.localdate(submitted)).days
        if 0 <= days_ago < 10:
            daily[9 - days_ago] += 1
    earlier = (
        AdmissionCycle.objects.filter(opens_at__lt=cycle.opens_at).order_by("-opens_at").first()
    )
    previous = None
    if earlier is not None:
        p_apps = Application.objects.filter(intake__cycle=earlier).exclude(status=S.DRAFT)
        if department_id is not None:
            p_apps = p_apps.filter(intake__program__department_id=department_id)
        previous = {"cycle": earlier.name, "total": p_apps.count()}
    return {
        "cycle": {"id": cycle.id, "name": cycle.name},
        "total": total,
        "accepted": accepted,
        "accepted_percent": _percent(accepted, total),
        "converted": converted,
        "not_converted": by_status.get(S.ACCEPTED, 0),
        "first_reply_days": _avg(replies_all),
        "unassigned": apps.filter(status=S.SUBMITTED, assigned_registrar__isnull=True).count(),
        "by_status": dict(by_status),
        "programs": sorted(programs.values(), key=lambda p: -p["total"]),
        "registrars": registrars,
        "daily": daily,
        "previous": previous,
    }


# ─── Student affairs (aggregates only, never names) ───────────────────────


def affairs_report(year, *, department_id: int | None = None) -> dict:
    from student_affairs.models import (
        MisconductReport,
        Regulation,
        RegulationAcknowledgement,
        StudentCase,
        StudentCaseEvent,
    )

    cases = StudentCase.objects.filter(
        created_at__date__gte=year.starts_on, created_at__date__lte=year.ends_on
    )
    students = StudentRecord.objects.filter(status=StudentRecord.Status.ACTIVE)
    if department_id is not None:
        cases = cases.filter(student_record__department_id=department_id)
        students = students.filter(department_id=department_id)
    kinds = [k for k, _ in StudentCase.Kind.choices]
    per_dept: dict[int, dict] = {}
    for row in (
        cases.values("student_record__department_id", "kind").annotate(n=Count("id")).order_by()
    ):
        entry = per_dept.setdefault(row["student_record__department_id"], dict.fromkeys(kinds, 0))
        entry[row["kind"]] = row["n"]
    headcount = dict(
        students.values("department_id")
        .annotate(n=Count("id"))
        .order_by()
        .values_list("department_id", "n")
    )
    names = dict(Department.objects.values_list("id", "name_ar"))
    rows = []
    for dept_id, counts in per_dept.items():
        total = sum(counts.values())
        people = headcount.get(dept_id, 0)
        rows.append(
            {
                "department": names.get(dept_id, ""),
                "by_kind": counts,
                "total": total,
                "per_100": round(100 * total / people, 1) if people else None,
            }
        )
    rows.sort(key=lambda r: r["department"])
    closed = list(
        cases.filter(status=StudentCase.Status.CLOSED).values_list("id", "created_at", "sanction")
    )
    closed_at = dict(
        StudentCaseEvent.objects.filter(
            case_id__in=[c[0] for c in closed], kind=StudentCaseEvent.Kind.CLOSED
        )
        .values("case_id")
        .annotate(at=Max("at"))
        .order_by()
        .values_list("case_id", "at")
    )
    durations = [
        (closed_at[case_id] - opened).total_seconds() / 86400
        for case_id, opened, _ in closed
        if case_id in closed_at
    ]
    outcomes: dict[str, int] = defaultdict(int)
    for _, _, sanction in closed:
        outcomes[sanction.strip() or "حفظ الحالة"] += 1
    misconduct = MisconductReport.objects.filter(
        created_at__date__gte=year.starts_on, created_at__date__lte=year.ends_on
    )
    if department_id is not None:
        misconduct = misconduct.filter(student_record__department_id=department_id)
    population = students.count()
    regulations = Regulation.objects.filter(
        status=Regulation.Status.PUBLISHED, requires_acknowledgement=True
    ).order_by("title")
    acks = dict(
        RegulationAcknowledgement.objects.filter(
            regulation__in=regulations, student_record__in=students
        )
        .values("regulation_id")
        .annotate(n=Count("id"))
        .order_by()
        .values_list("regulation_id", "n")
    )
    acknowledgements = [
        {
            "regulation": reg.title,
            "acknowledged": acks.get(reg.id, 0),
            "percent": _percent(acks.get(reg.id, 0), population),
        }
        for reg in regulations
    ]
    total_acks = sum(a["acknowledged"] for a in acknowledgements)
    return {
        "year": {"id": year.id, "name": year.name},
        "total": cases.count(),
        "closed": len(closed),
        "close_days": _avg(durations),
        "misconduct_cases": cases.filter(kind=StudentCase.Kind.EXAM_MISCONDUCT).count(),
        "misconduct_from_exams": misconduct.filter(attempt__isnull=False).count(),
        "kinds": kinds,
        "rows": rows,
        "outcomes": sorted(
            ({"outcome": k, "count": v} for k, v in outcomes.items()), key=lambda o: -o["count"]
        ),
        "acknowledgements": acknowledgements,
        "acknowledged_percent": _percent(total_acks, population * len(acknowledgements)),
        "students": population,
    }
