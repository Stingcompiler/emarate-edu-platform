import { useQuery } from "@tanstack/react-query";
import { FolderLock, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
  Button,
  Card,
  Chip,
  EmptyState,
  SectionLabel,
  StatusBadge,
  STATUS_LABELS,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when, count, N } from "../../lib/format";
import { can } from "../../lib/nav";
import { ALL, Pager, useLocalPages } from "../../components/Pager";

export const KIND = {
  exam_misconduct: { short: "غش", label: "غش امتحان" },
  academic: { short: "أك", label: "أكاديمية" },
  conduct: { short: "سل", label: "سلوكية" },
  welfare: { short: "اج", label: "اجتماعية" },
} as const;
type Tab = "open" | "reports" | "closed";

export const EVENTS: Record<string, string> = {
  opened: "فُتحت",
  note: "ملاحظة",
  decided: "قرار",
  published: "نُشرت للطالب",
  closed: "أُغلقت",
  reopened: "أُعيد فتحها",
};

/** Boards: StudentAffairsCases (phone) and DesktopStudentAffairsCases (desktop table). */
export function Cases() {
  const me = useMe();
  const manager = can(me.data, "cases.manage");
  const [tab, setTab] = useState<Tab>("open");
  const [kind, setKind] = useState<string>("");
  const cases = useQuery({
    queryKey: ["cases"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/cases", { params: { query: ALL } }))?.results ?? [],
  });
  const reports = useQuery({
    queryKey: ["misconduct-reports"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/misconduct-reports", {
          params: { query: { ...ALL, status: "new" } },
        }),
      )?.results ?? [],
  });
  const all = cases.data ?? [];
  const open = all.filter((c) => c.status !== "closed");
  const shown = (tab === "closed" ? all.filter((c) => c.status === "closed") : open).filter(
    (c) => !kind || c.kind === kind,
  );
  const paged = useLocalPages(shown, [tab, kind]);
  const age = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  return (
    <PortalShell
      title="الحالات"
      subtitle={`${open.length.toLocaleString("ar")} مفتوحة · سرية — لا يراها إلا المخوَّلون والطالب المعني بعد النشر`}
      titleAction={
        manager ? (
          <Link to="/cases/new">
            <Button className="min-h-9 px-3">
              <Plus size={16} aria-hidden />
              حالة
            </Button>
          </Link>
        ) : undefined
      }
    >
      <FilterBar>
        <div className="flex flex-wrap gap-2">
          <Chip active={tab === "open"} onClick={() => setTab("open")}>
            مفتوحة {open.length}
          </Chip>
          <Chip active={tab === "reports"} onClick={() => setTab("reports")}>
            بلاغات جديدة {reports.data?.length ?? 0}
          </Chip>
          <Chip active={tab === "closed"} onClick={() => setTab("closed")}>
            مقفلة {all.length - open.length}
          </Chip>
          {tab !== "reports" && (
            <select
              aria-label="النوع"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="min-h-9 rounded-full border border-border-soft bg-surface px-3 text-sm"
            >
              <option value="">كل الأنواع</option>
              {Object.entries(KIND).map(([key, k]) => (
                <option key={key} value={key}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </FilterBar>

      {tab === "reports" ? (
        <>
          <SectionLabel>بلاغات جديدة من الأساتذة</SectionLabel>
          {!reports.data?.length ? (
            <Card>
              <EmptyState icon={<FolderLock size={24} aria-hidden />} title="لا بلاغات جديدة" />
            </Card>
          ) : (
            <Card className="divide-y divide-border-soft">
              {reports.data.map((r) => (
                <Link
                  key={r.public_id}
                  to={`/cases/new?report=${r.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <KindTile kind="exam_misconduct" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">
                      {r.student.full_name_ar} ·{" "}
                      <span dir="ltr">{r.student.university_number}</span>
                    </span>
                    <span className="text-xs text-text-muted">
                      {r.course_code} · {r.reported_by} · {when(r.created_at)}
                    </span>
                  </span>
                  <StatusBadge status="new" label="جديد" />
                </Link>
              ))}
            </Card>
          )}
        </>
      ) : !shown.length ? (
        <Card className="mt-4">
          <EmptyState icon={<FolderLock size={24} aria-hidden />} title="لا حالات هنا" />
        </Card>
      ) : (
        <>
          {/* Phone: cards */}
          <Card className="mt-4 divide-y divide-border-soft lg:hidden">
            {paged.shown.map((c) => (
              <Link
                key={c.public_id}
                to={`/cases/${c.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <KindTile kind={c.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    {c.student.full_name_ar} · <span dir="ltr">{c.student.university_number}</span>
                  </span>
                  <span className="block truncate text-xs text-text-muted">{c.title}</span>
                </span>
                <span
                  className={`text-xs ${age(c.created_at) > 14 ? "font-semibold text-danger-strong" : "text-text-muted"}`}
                >
                  {ageLabel(age(c.created_at))}
                </span>
              </Link>
            ))}
          </Card>
          {/* Desktop: table */}
          <Card className="mt-4 hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">الحالة</th>
                  <th className="px-3 py-2.5 text-start font-medium">الطالب</th>
                  <th className="px-3 py-2.5 text-start font-medium">المرحلة</th>
                  <th className="px-3 py-2.5 text-start font-medium">العمر</th>
                  <th className="px-4 py-2.5 text-start font-medium">آخر إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {paged.shown.map((c) => {
                  const last = c.events[c.events.length - 1];
                  return (
                    <tr key={c.public_id} className="hover:bg-surface-alt">
                      <td className="px-4 py-3">
                        <Link
                          to={`/cases/${c.public_id}`}
                          className="flex items-center gap-2 font-semibold text-text"
                        >
                          <KindTile kind={c.kind} small />
                          {c.title}
                        </Link>
                      </td>
                      <td className="px-3">
                        {c.student.full_name_ar}{" "}
                        <span className="text-xs text-text-muted" dir="ltr">
                          {c.student.university_number}
                        </span>
                      </td>
                      <td className="px-3">
                        <StatusBadge
                          status={c.status}
                          label={STATUS_LABELS[c.status] ?? c.status}
                        />
                      </td>
                      <td
                        className={`px-3 ${age(c.created_at) > 14 ? "font-semibold text-danger-strong" : ""}`}
                      >
                        {ageLabel(age(c.created_at))}
                      </td>
                      <td className="px-4 text-xs text-text-muted">
                        {last
                          ? `${last.note || EVENTS[last.kind] || last.kind} · ${when(last.at)}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <Pager page={paged.page} count={paged.count} onPage={paged.setPage} />
    </PortalShell>
  );
}

export function KindTile({ kind, small }: { kind: string; small?: boolean }) {
  const k = KIND[kind as keyof typeof KIND];
  const tone =
    kind === "exam_misconduct"
      ? "bg-danger-soft text-danger-strong"
      : kind === "academic"
        ? "bg-warning-soft text-warning-strong"
        : "bg-info-soft text-info-strong";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg text-xs font-bold ${tone} ${small ? "size-7" : "size-11"}`}
    >
      {k?.short ?? "؟"}
    </span>
  );
}

/** Days a case has been open, with Arabic number agreement. */
function ageLabel(days: number): string {
  return days < 1 ? "اليوم" : count(days, N.day);
}
