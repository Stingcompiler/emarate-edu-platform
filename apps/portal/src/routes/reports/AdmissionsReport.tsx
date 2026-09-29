import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import {
  Bars,
  ExportBar,
  Kpi,
  PastReports,
  Picker,
  days,
  downloadCsv,
  initials,
  num,
  pct,
  useDepartments,
} from "../../lib/reports";
import { STATUS_LABEL } from "../../lib/visitor";
import { count, N } from "../../lib/format";
import { ALL } from "../../components/Pager";

const STAGES = ["submitted", "under_review", "missing_documents", "accepted", "rejected"] as const;
const STAGE_TONE: Record<string, string> = {
  submitted: "bg-info",
  under_review: "bg-primary-300",
  missing_documents: "bg-warning",
  accepted: "bg-success",
  rejected: "bg-danger",
};

/** Board: DesktopAdmissionsReports; phone derived — KPIs 2×n, stacked program bars, registrar cards. */
export function AdmissionsReport() {
  const departments = useDepartments();
  const cycles = useQuery({
    queryKey: ["admissions", "cycles"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/admission-cycles", { params: { query: ALL } }))?.results ?? [],
  });
  const [cycle, setCycle] = useState<number>();
  const [department, setDepartment] = useState<number>();
  const report = useQuery({
    queryKey: ["reports", "admissions", cycle, department],
    queryFn: async () =>
      (await api.GET("/api/v1/reports/admissions", { params: { query: { cycle, department } } }))
        .data ?? null,
  });
  const r = report.data;
  const growth = r?.previous?.total
    ? Math.round((100 * (r.total - r.previous.total)) / r.previous.total)
    : null;
  const csv = () =>
    r &&
    downloadCsv(
      `admissions-${r.cycle.name}`,
      ["البرنامج", "القسم", "المجموع", ...STAGES.map((s) => STATUS_LABEL[s] ?? s)],
      r.programs.map((p) => [
        p.program,
        p.department,
        p.total,
        ...STAGES.map((s) => p.by_status[s] ?? 0),
      ]),
    );
  return (
    <PortalShell title="تقارير القبول" subtitle={r ? `${r.cycle.name} · حتى اليوم` : undefined}>
      <div className="flex flex-wrap items-center gap-3">
        <Picker
          label="الدورة"
          value={cycle ?? r?.cycle.id}
          items={cycles.data ?? []}
          name={(c) => c.name}
          onChange={setCycle}
        />
        <Picker
          label="القسم"
          value={department}
          items={departments.data ?? []}
          name={(d) => d.name_ar}
          onChange={setDepartment}
          all="الكل"
        />
        <div className="ms-auto">
          <ExportBar
            onCsv={csv}
            snapshot={{ kind: "admissions", cycle: cycle ?? r?.cycle.id, department }}
          />
        </div>
      </div>
      {r && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Kpi
              value={r.total ?? "—"}
              label="طلبًا"
              note={
                growth != null ? (
                  <bdi>{`${growth >= 0 ? "+" : "−"}${num(Math.abs(growth))}٪ عن ${r.previous!.cycle}`}</bdi>
                ) : undefined
              }
            />
            <Kpi
              value={r.accepted ?? "—"}
              label="مقبولًا"
              note={`${pct(r.accepted_percent)} من الطلبات`}
            />
            <Kpi
              value={r.converted ?? "—"}
              label="حُوِّلوا إلى طلاب"
              note={`${num(r.not_converted)} لم يُحوَّلوا`}
            />
            <Kpi
              value={days(r.first_reply_days)}
              label="متوسط أول رد"
              note="الهدف 3 أيام"
              tone={r.first_reply_days != null && r.first_reply_days > 3 ? "danger" : undefined}
            />
            <Kpi
              value={r.unassigned ?? "—"}
              label="غير موزع"
              tone={r.unassigned ? "danger" : undefined}
            />
          </div>
          <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
            <div className="space-y-4">
              <SectionLabel>الطلبات حسب البرنامج والحالة · من الأعلى طلبًا</SectionLabel>
              <Card className="space-y-3 p-4">
                {r.programs.map((p) => (
                  <div key={p.program}>
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-text">{p.program}</span>
                      <span className="text-text-muted">{num(p.total)}</span>
                    </div>
                    <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-surface-alt">
                      {STAGES.map((s) => (
                        <span
                          key={s}
                          className={STAGE_TONE[s]}
                          style={{
                            width: `${(100 * (p.by_status[s] ?? 0)) / Math.max(1, p.total)}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-text-muted">
                  {STAGES.map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`size-2 rounded-full ${STAGE_TONE[s]}`} />
                      {STATUS_LABEL[s]}
                    </span>
                  ))}
                </div>
                {!r.programs.length && (
                  <p className="text-sm text-text-muted">لا طلبات في هذه الدورة.</p>
                )}
              </Card>
            </div>
            <aside className="mt-6 space-y-4 lg:mt-0">
              <Card className="p-4">
                <p className="mb-3 text-sm font-semibold text-text">
                  الطلبات اليومية · آخر 10 أيام
                </p>
                <Bars
                  values={r.daily}
                  labels={r.daily.map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (9 - i));
                    return num(d.getDate());
                  })}
                />
              </Card>
              <PastReports kind="admissions" />
            </aside>
          </div>
          <div className="mt-6">
            <SectionLabel>أداء المسجلين</SectionLabel>
            <Card className="divide-y divide-border-soft">
              <div className="hidden grid-cols-[minmax(0,1fr)_90px_70px_70px_90px_70px] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted lg:grid">
                <span>المسجل</span>
                <span>الأقسام</span>
                <span>طلبات</span>
                <span>أول رد</span>
                <span>استفسارات متأخرة</span>
                <span>قرارات</span>
              </div>
              {r.registrars.map((g) => (
                <div
                  key={g.name}
                  className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_90px_70px_70px_90px_70px]"
                >
                  <span className="flex items-center gap-3 lg:col-span-1">
                    <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                      {initials(g.name)}
                    </span>
                    <span className="font-semibold text-text">{g.name}</span>
                  </span>
                  <span className="text-xs text-text-muted lg:hidden">
                    {g.departments.join(" · ")} · {count(g.applications, N.application)} · أول رد{" "}
                    {days(g.first_reply_days)} · {count(g.decisions, N.decision)}
                  </span>
                  <bdi className="hidden text-xs lg:inline">{g.departments.join(" · ") || "—"}</bdi>
                  <span className="hidden lg:inline">{num(g.applications)}</span>
                  <span className="hidden lg:inline">{days(g.first_reply_days)}</span>
                  <span
                    className={`hidden lg:inline ${g.late_inquiries ? "font-semibold text-danger-strong" : ""}`}
                  >
                    {num(g.late_inquiries)}
                  </span>
                  <span className="hidden lg:inline">{num(g.decisions)}</span>
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </PortalShell>
  );
}
