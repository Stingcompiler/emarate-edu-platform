"""Report snapshots (the only writes in the reports app) and HR notice evidence."""

from __future__ import annotations

import hashlib
import json

from django.core.serializers.json import DjangoJSONEncoder

from accounts import rbac
from accounts.rbac import Scope
from audit.services import RequestMeta, record

from . import metrics
from .models import ReportSnapshot


def teacher_evidence(teacher) -> tuple[dict, object]:
    """This term's indicators for one teacher (kept on the notice)."""
    term = metrics.current_term()
    if term is None:
        return {}, None
    rows = metrics.teacher_rows(term, Scope(everything=True), user_ids={teacher.id})
    if not rows:
        return {}, term
    row = {k: v for k, v in rows[0].items() if k not in {"id", "public_id"}}
    row["term"] = term.name_ar
    return row, term


# ─── Snapshots ────────────────────────────────────────────────────────────

SNAPSHOT_CAPABILITY = {
    ReportSnapshot.Kind.DEPARTMENT: "reports.department",
    ReportSnapshot.Kind.TEACHERS: "reports.teachers",
    ReportSnapshot.Kind.ADMISSIONS: "reports.admissions",
    ReportSnapshot.Kind.AFFAIRS: "reports.affairs",
}


def visible_snapshots(user):
    from django.db.models import Q

    allowed = Q(pk__in=[])
    for kind, capability in SNAPSHOT_CAPABILITY.items():
        scope = rbac.scope_for(user, capability)
        if scope.none:
            continue
        if scope.everything:
            allowed |= Q(kind=kind)
        else:
            allowed |= Q(kind=kind, department_id__in=scope.departments)
    return ReportSnapshot.objects.filter(allowed).select_related("created_by", "term")


def create_snapshot(
    meta: RequestMeta, *, kind: str, title: str, data: dict, notes: str = "", **links
) -> ReportSnapshot:
    payload = json.loads(json.dumps(data, cls=DjangoJSONEncoder))
    digest = hashlib.sha256(
        json.dumps({"data": payload, "notes": notes}, sort_keys=True).encode()
    ).hexdigest()
    snapshot = ReportSnapshot.objects.create(
        kind=kind,
        title=title[:200],
        data=payload,
        notes=notes.strip(),
        digest=digest,
        created_by=meta.actor,
        term=links.get("term"),
        department=links.get("department"),
        params=links.get("params", {}),
    )
    record(
        meta,
        "reports.snapshot",
        snapshot,
        new={"kind": kind, "digest": digest},
        department_id=snapshot.department_id,
    )
    return snapshot
