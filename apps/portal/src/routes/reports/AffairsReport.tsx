import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Card, Notice, SectionLabel, ScrollRegion } from "../../components/ui";
import { api, ok } from "../../lib/api";
import {
  ExportBar,
  Kpi,
  PastReports,
  Picker,
  days,
  downloadCsv,
  num,
  pct,
  useDepartments,
} from "../../lib/reports";
import { count, N } from "../../lib/format";
import { ALL } from "../../components/Pager";

const KIND: Record<string, string> = {
  exam_misconduct: "غش",
  academic: "أكاديمية",
  conduct: "سلوكية",
  welfare: "اجتماعية",
};

/** Board: DesktopStudentAffairsReports (aggregates only, never names); phone derived. */
export function AffairsReport() {
  const departments = useDepartments();
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/academic-years", { params: { query: ALL } }))?.results ?? [],
  });
  const [year, setYear] = useState<number>();
  const [department, setDepartment] = useState<number>();
  const report = useQuery({
    queryKey: ["reports", "affairs", year, department],
    queryFn: async () =>
      (await api.GET("/api/v1/reports/affairs", { params: { query: { year, department } } }))
        .data ?? null,
  });
  const r = report.data;
  const kinds = r?.kinds ?? [];
  const totals = kinds.map((k) =>
    (r?.rows ?? []).reduce((sum, row) => sum + (row.by_kind[k] ?? 0), 0),
  );
  const csv = () =>
    r &&
    downloadCsv(
      `student-affairs-${r.year.name}`,
      ["القسم", ...kinds.map((k) => KIND[k] ?? k), "المجموع", "لكل 100 طالب"],
      r.rows.map((row) => [
        row.department,
        ...kinds.map((k) => row.by_kind[k] ?? 0),
        row.total,
        row.per_100,
      ]),
    );
  return (
    <PortalShell title="تقارير شؤون الطلاب" subtitle={r ? `العام ${r.year.name}` : undefined}>
      <div className="flex flex-wrap items-center gap-3">
        <Picker
          label="العام"
          value={year ?? r?.year.id}
          items={years.data ?? []}
          name={(y) => y.name}
          onChange={setYear}
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
            snapshot={{ kind: "affairs", year: year ?? r?.year.id, department }}
          />
        </div>
      </div>
      {r && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Kpi value={r.total ?? "—"} label="حالة هذا العام" note={`${num(r.closed)} مقفلة`} />
            <Kpi value={days(r.close_days)} label="متوسط زمن الإقفال" note="الهدف 14 يومًا" />
            <Kpi
              value={r.misconduct_cases ?? "—"}
              label="حالات غش"
              note={`${count(r.misconduct_from_exams, N.report)} من الاختبارات الإلكترونية`}
            />
            <Kpi
              value={pct(r.acknowledged_percent)}
              label="نسبة الإقرار باللوائح"
              note={`اللوائح التي تتطلب إقرارًا: ${num(r.acknowledgements.length)}`}
            />
            <Kpi value="0" label="بيانات شخصية في التصدير" note="مجهّل افتراضيًا" />
          </div>
          <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
            <div className="space-y-4">
              <SectionLabel>الحالات حسب النوع والقسم</SectionLabel>
              <Card className="p-4">
                <ScrollRegion label="الحالات حسب النوع والقسم">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-xs text-text-muted">
                      <tr>
                        {[
                          "القسم",
                          ...kinds.map((k) => KIND[k] ?? k),
                          "المجموع",
                          "لكل 100 طالب",
                        ].map((h) => (
                          <th key={h} className="py-2 text-start font-normal">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {r.rows.map((row) => (
                        <tr key={row.department}>
                          <td className="py-2 font-semibold">{row.department || "—"}</td>
                          {kinds.map((k) => (
                            <td key={k}>{num(row.by_kind[k] ?? 0)}</td>
                          ))}
                          <td className="font-semibold">{num(row.total)}</td>
                          <td>{num(row.per_100, 1)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="py-2">الكلية</td>
                        {totals.map((t, i) => (
                          <td key={i}>{num(t)}</td>
                        ))}
                        <td>{num(r.total)}</td>
                        <td>{r.students ? num((100 * r.total) / r.students, 1) : "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </ScrollRegion>
              </Card>
              <SectionLabel>القرارات في الحالات المقفلة · {num(r.closed)}</SectionLabel>
              <Card className="flex flex-wrap gap-2 p-4">
                {r.outcomes.map((o) => (
                  <span key={o.outcome} className="rounded-lg bg-surface-alt px-3 py-2 text-sm">
                    <b>{num(o.count)}</b> {o.outcome}
                  </span>
                ))}
                {!r.outcomes.length && (
                  <span className="text-sm text-text-muted">لا حالات مقفلة بعد.</span>
                )}
              </Card>
            </div>
            <aside className="mt-6 space-y-4 lg:mt-0">
              <SectionLabel>الإقرار باللوائح</SectionLabel>
              <Card className="space-y-3 p-4">
                {r.acknowledgements.map((a) => (
                  <div key={a.regulation}>
                    <div className="flex justify-between text-sm">
                      <span>{a.regulation}</span>
                      <b>{pct(a.percent)}</b>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full bg-primary" style={{ width: `${a.percent ?? 0}%` }} />
                    </div>
                  </div>
                ))}
                {!r.acknowledgements.length && (
                  <p className="text-sm text-text-muted">لا لوائح تتطلب إقرارًا.</p>
                )}
              </Card>
              <Notice tone="info">
                التقارير مجمّعة ولا تعرض أسماء ولا أرقامًا جامعية. الحالات الاجتماعية تُحتسب في
                الأعداد فقط.
              </Notice>
              <PastReports kind="affairs" />
            </aside>
          </div>
        </>
      )}
    </PortalShell>
  );
}
