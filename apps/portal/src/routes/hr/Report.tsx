import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel, ScrollRegion } from "../../components/ui";
import { ExportBar, PastReports, Picker, days, num, pct, useTerms } from "../../lib/reports";
import { useTeachersReport } from "./Teachers";

/** Board: DesktopHRReports — the semester report: preview, notes, export (frozen PDF), past exports. */
export function HRReport() {
  const terms = useTerms();
  const [term, setTerm] = useState<number>();
  const [notes, setNotes] = useState("");
  const report = useTeachersReport(term);
  const r = report.data;
  const s = r?.summary;
  const p = r?.previous;
  return (
    <PortalShell
      title="تقرير أداء هيئة التدريس"
      subtitle={r ? `${r.term.name}${p ? ` مقابل ${p.term}` : ""}` : undefined}
      back={{ label: "الموارد البشرية", to: "/hr" }}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <Card className="p-5">
          {r && s && (
            <>
              <p className="text-lg font-bold text-text">تقرير أداء هيئة التدريس — {r.term.name}</p>
              <p className="text-xs text-text-muted">
                كلية الإمارات للعلوم والتقنية · الموارد البشرية · حتى الأسبوع {num(r.term.week)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  [num(s.members), "الأعضاء", ""],
                  [days(s.grading_days), "زمن التصحيح", p ? `سابقًا ${days(p.grading_days)}` : ""],
                  [
                    pct(s.upload_percent),
                    "انتظام الرفع",
                    p ? `سابقًا ${pct(p.upload_percent)}` : "",
                  ],
                  [num(s.counts.below), "تحت الحد", p ? `سابقًا ${num(p.counts.below)}` : ""],
                ].map(([v, l, n]) => (
                  <div key={l} className="rounded-lg bg-surface-alt p-3">
                    <p className="text-xl font-bold">{v}</p>
                    <p className="text-xs text-text-muted">{l}</p>
                    {n && <p className="text-[11px] text-text-muted">{n}</p>}
                  </div>
                ))}
              </div>
              <SectionLabel>حسب القسم</SectionLabel>
              <ScrollRegion label="حسب القسم">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-xs text-text-muted">
                    <tr className="text-start">
                      {[
                        "القسم",
                        "أعضاء",
                        "زمن التصحيح",
                        "انتظام الرفع",
                        "جلسات بث",
                        "تحت الحد",
                      ].map((h) => (
                        <th key={h} className="py-2 text-start font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {r.departments.map((d) => (
                      <tr key={d.department}>
                        <td className="py-2 font-semibold">{d.department || "—"}</td>
                        <td>{num(d.members)}</td>
                        <td>{days(d.grading_days)}</td>
                        <td>{pct(d.upload_percent)}</td>
                        <td>
                          {num(d.live_held)}/{num(d.live_planned)}
                        </td>
                        <td className={d.below ? "font-semibold text-danger-strong" : ""}>
                          {num(d.below)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
              <p className="mt-4 text-xs text-text-muted">سري — للإدارة العليا والشؤون العلمية</p>
            </>
          )}
        </Card>
        <aside className="mt-6 space-y-4 lg:mt-0">
          <Card className="space-y-3 p-4">
            <Picker
              label="الفصل"
              value={term ?? r?.term.id}
              items={terms.data ?? []}
              name={(t) => t.name_ar}
              onChange={setTerm}
            />
            <label className="block text-xs text-text-muted">
              الملاحظات (تظهر في الصفحة الأولى)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block min-h-24 w-full rounded-lg border border-border bg-surface p-2 text-sm text-text"
              />
            </label>
            <ExportBar snapshot={{ kind: "teachers", term: term ?? r?.term.id, notes }} />
            <p className="text-[11px] text-text-muted">
              يُحفظ كل تقرير مُصدَّر بنسخته في سجل التقارير ولا يُعدّل بعد الإصدار.
            </p>
          </Card>
          <PastReports kind="teachers" />
        </aside>
      </div>
    </PortalShell>
  );
}
