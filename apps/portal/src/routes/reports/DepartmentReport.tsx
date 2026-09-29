import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when, count, N } from "../../lib/format";
import {
  Bars,
  Delta,
  ExportBar,
  Kpi,
  PastReports,
  Picker,
  days,
  downloadCsv,
  num,
  pct,
  useDepartments,
  useTerms,
} from "../../lib/reports";

/** Board: DesktopDeptReports (desktop); phone derived — KPIs 2×n, course cards, chart. */
export function DepartmentReport() {
  const me = useMe();
  const scope = me.data?.capabilities?.["reports.department"] as
    { everything?: boolean } | undefined;
  const collegeWide = !!scope?.everything;
  const terms = useTerms();
  const departments = useDepartments();
  const [term, setTerm] = useState<number>();
  const [department, setDepartment] = useState<number>();
  const report = useQuery({
    queryKey: ["reports", "department", term, department],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/reports/department", {
        params: { query: { term, department } },
      });
      return data ?? null;
    },
  });
  const r = report.data;
  const k = r?.kpis;
  const p = r?.previous;
  const csv = () =>
    r &&
    downloadCsv(
      `department-report-${r.term.name}`,
      [
        "الرمز",
        "المادة",
        "المستوى",
        "الأستاذ",
        "الطلاب",
        "المحاضرات",
        "المخطط",
        "التسليم٪",
        "غير مصحح",
        "آخر رفع",
      ],
      r.rows.map((c) => [
        c.code,
        c.name,
        c.level,
        c.teachers.join(" / "),
        c.students,
        c.lectures,
        c.planned,
        c.submission_percent,
        c.ungraded,
        c.last_upload ?? "",
      ]),
    );
  const title = r
    ? `تقارير القسم — ${r.departments.length === 1 ? r.departments[0] : "كل الأقسام"}`
    : "تقارير القسم";
  return (
    <PortalShell
      title={title}
      subtitle={r ? `${r.term.name} · حتى الأسبوع ${num(r.term.week)}` : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Picker
          label="الفصل"
          value={term ?? r?.term.id}
          items={terms.data ?? []}
          name={(t) => t.name_ar}
          onChange={setTerm}
        />
        {collegeWide && (
          <Picker
            label="القسم"
            value={department}
            items={departments.data ?? []}
            name={(d) => d.name_ar}
            onChange={setDepartment}
            all="الكل"
          />
        )}
        <div className="ms-auto">
          <ExportBar
            onCsv={csv}
            snapshot={{ kind: "department", term: term ?? r?.term.id, department }}
          />
        </div>
      </div>
      {r && k && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Kpi
              value={k.offerings ?? "—"}
              label="مادة مفتوحة"
              note={
                k.without_teacher ? (
                  <span className="text-danger-strong">{num(k.without_teacher)} بلا أستاذ</span>
                ) : (
                  "كلها بأساتذة"
                )
              }
            />
            <Kpi
              value={k.lectures ?? "—"}
              label="محاضرة مرفوعة"
              note={`+${num(k.lectures_30d)} في 30 يومًا`}
            />
            <Kpi
              value={k.students ?? "—"}
              label="الطلاب"
              note={`${pct(k.enrolled_percent)} مسجلون في مواد`}
            />
            <Kpi
              value={days(k.grading_days)}
              label="متوسط التصحيح"
              note={`الحد ${count(r.thresholds.grading_days, N.day)}`}
              tone={
                k.grading_days != null && k.grading_days > r.thresholds.grading_days
                  ? "danger"
                  : undefined
              }
            />
            <Kpi
              value={pct(k.submission_percent)}
              label="نسبة التسليم"
              note={
                p ? (
                  <>
                    مقارنة بـ{p.term}:{" "}
                    <Delta now={k.submission_percent} before={p.submission_percent} unit="٪" />
                  </>
                ) : undefined
              }
            />
          </div>

          <div className="mt-6 ">
            <section>
              <SectionLabel>المواد — {r.term.name} · الأقل رفعًا أولًا</SectionLabel>
              <Card className="divide-y divide-border-soft">
                <div className="hidden grid-cols-[88px_minmax(0,1.4fr)_minmax(0,1fr)_64px_80px_72px_72px_96px] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted lg:grid">
                  <span>المادة</span>
                  <span />
                  <span>الأستاذ</span>
                  <span>الطلاب</span>
                  <span>المحاضرات</span>
                  <span>التسليم</span>
                  <span>غير مصحح</span>
                  <span>آخر رفع</span>
                </div>
                {r.rows.map((c) => (
                  <div
                    key={c.public_id}
                    className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-3 text-sm lg:grid-cols-[88px_minmax(0,1.4fr)_minmax(0,1fr)_64px_80px_72px_72px_96px] lg:items-center"
                  >
                    <bdi className="font-mono text-xs text-text-muted">{c.code}</bdi>
                    <span className="col-start-1 font-semibold text-text lg:col-start-auto">
                      {c.name}{" "}
                      <span className="text-xs font-normal text-text-muted">· م{num(c.level)}</span>
                    </span>
                    <span
                      className={`col-start-1 text-xs lg:col-start-auto lg:text-sm ${c.teachers.length ? "text-text-muted" : "font-semibold text-danger-strong"}`}
                    >
                      {c.teachers.join("، ") || "بلا أستاذ"}
                    </span>
                    <span className="col-start-1 text-xs text-text-muted lg:col-start-auto lg:text-sm lg:text-text">
                      <span className="lg:hidden">
                        {count(c.students, N.student)} · {num(c.lectures)}/{num(c.planned)} محاضرات
                        · تسليم {pct(c.submission_percent)} · غير مصحح {num(c.ungraded)}
                      </span>
                      <span className="hidden lg:inline">{num(c.students)}</span>
                    </span>
                    <span
                      className={`hidden lg:inline ${c.lectures < c.planned / 2 ? "font-semibold text-danger-strong" : ""}`}
                    >
                      {num(c.lectures)}/{num(c.planned)}
                    </span>
                    <span className="hidden lg:inline">{pct(c.submission_percent)}</span>
                    <span
                      className={`hidden lg:inline ${c.ungraded > 10 ? "font-semibold text-warning-strong" : ""}`}
                    >
                      {num(c.ungraded)}
                    </span>
                    <span className="row-start-1 text-xs text-text-muted lg:row-start-auto">
                      {c.last_upload ? when(c.last_upload) : "—"}
                    </span>
                  </div>
                ))}
                {!r.rows.length && (
                  <p className="px-4 py-6 text-center text-sm text-text-muted">
                    لا مواد في هذا الفصل
                  </p>
                )}
              </Card>
            </section>
            <aside className="mt-6 grid gap-4 lg:grid-cols-3 lg:items-start">
              <Card className="p-4">
                <p className="mb-3 text-sm font-semibold text-text">
                  الرفع الأسبوعي — آخر 8 أسابيع
                </p>
                <Bars
                  values={r.weekly_uploads}
                  labels={r.weekly_uploads.map((_, i) => num(i + 1))}
                  caption="محاضرات مرفوعة لكل أسبوع · الأسبوع 8 = الحالي"
                />
              </Card>
              {p && (
                <Card className="divide-y divide-border-soft text-sm">
                  <p className="px-4 py-2 text-xs font-semibold text-text-muted">
                    مقارنة بـ{p.term}
                  </p>
                  {[
                    [
                      "متوسط زمن التصحيح",
                      days(k.grading_days),
                      <Delta key="g" now={k.grading_days} before={p.grading_days} better="down" />,
                    ],
                    [
                      "نسبة التسليم",
                      pct(k.submission_percent),
                      <Delta
                        key="s"
                        now={k.submission_percent}
                        before={p.submission_percent}
                        unit="٪"
                      />,
                    ],
                    [
                      "محاضرات لكل مادة",
                      num(k.lectures_per_offering, 1),
                      <Delta
                        key="l"
                        now={k.lectures_per_offering}
                        before={p.lectures_per_offering}
                      />,
                    ],
                    [
                      "جلسات بث منفذة",
                      num(k.live_held),
                      <Delta key="v" now={k.live_held} before={p.live_held} />,
                    ],
                    [
                      "مواد بلا أستاذ",
                      num(k.without_teacher),
                      <Delta
                        key="w"
                        now={k.without_teacher}
                        before={p.without_teacher}
                        better="down"
                      />,
                    ],
                  ].map(([label, value, delta]) => (
                    <div
                      key={String(label)}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="text-text-muted">{label}</span>
                      <span className="flex items-center gap-2 font-semibold">
                        {value}
                        <span className="text-xs font-normal">{delta}</span>
                      </span>
                    </div>
                  ))}
                </Card>
              )}
              <PastReports kind="department" />
            </aside>
          </div>
        </>
      )}
    </PortalShell>
  );
}
