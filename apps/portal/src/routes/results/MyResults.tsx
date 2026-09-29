import type { Schemas } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { useState } from "react";

import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Card,
  Chip,
  CodeTile,
  EmptyState,
  StatusBadge,
  STATUS_LABELS,
  splitCode,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { count, N, ltr } from "../../lib/format";

type Term = Schemas["MyTerm"];
const date = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "long" });

/**
 * Boards: StudentResults (phone) and DesktopStudentResults (desktop).
 * Not built yet: coursework/final split (the file carries totals) and the PDF
 * transcript (Phase 8 reports).
 */
/** "91", "67.5" — not "91.00". */
const mark = (v: string | number) =>
  Number(v).toLocaleString("ar-u-nu-latn", { maximumFractionDigits: 2 });

export function MyResults() {
  const me = useMe();
  const results = useQuery({
    queryKey: ["me", "results"],
    queryFn: async () => ok(await api.GET("/api/v1/me/results")) ?? null,
  });
  const [picked, setPicked] = useState<number | null>(null);
  const data = results.data;
  const terms = data?.terms ?? [];
  const term = terms.find((t) => t.term === picked) ?? terms[0];
  const student = me.data?.student;

  return (
    <PortalShell
      title="النتائج"
      subtitle={
        student
          ? `${ltr(student.university_number)} · ${student.program} · المستوى ${student.level}`
          : undefined
      }
      titleAction={
        term ? (
          <Link to="/print/my-results" className="text-sm font-semibold text-primary">
            طباعة / PDF
          </Link>
        ) : undefined
      }
    >
      {results.isPending ? null : !term ? (
        <Card>
          <EmptyState icon={<Award size={24} aria-hidden />} title="لا نتائج منشورة بعد">
            ستظهر نتائجك هنا فور نشرها، وسيصلك إشعار.
          </EmptyState>
        </Card>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
          <div className="min-w-0">
            <div
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
              role="tablist"
              aria-label="الفصول"
            >
              {terms.map((t) => (
                <Chip
                  key={t.term}
                  role="tab"
                  aria-selected={t.term === term.term}
                  active={t.term === term.term}
                  onClick={() => setPicked(t.term)}
                >
                  {t.term_name}
                </Chip>
              ))}
            </div>
            <TermSummary term={term} cumulative={data?.cumulative_gpa ?? null} />
            <TermRows term={term} show={data?.show ?? {}} />
            {data?.notice && (
              <p className="mt-4 px-1 text-xs leading-relaxed text-text-muted">{data.notice}</p>
            )}
            <p className="mt-2 px-1 text-xs text-text-muted">
              أي تعديل لاحق على نتيجة معتمدة يصلك بإشعار.
            </p>
          </div>
          <aside className="hidden space-y-4 lg:block">
            {data?.cumulative_gpa && (
              <Card className="p-4">
                <p className="text-xs text-text-muted">المعدل التراكمي</p>
                <p className="mt-1 text-3xl font-bold text-text">{data.cumulative_gpa}</p>
                <ul className="mt-3 divide-y divide-border-soft text-sm">
                  {terms.map((t) => (
                    <li key={t.term} className="flex justify-between py-2">
                      <span className="text-text-muted">{t.term_name}</span>
                      <span className="font-semibold text-text">{t.gpa ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      )}
    </PortalShell>
  );
}

function TermSummary({ term, cumulative }: { term: Term; cumulative: string | null }) {
  const passed = term.results.filter((r) => r.status === "pass").length;
  const stats = [
    { label: "المعدل الفصلي", value: term.gpa ?? "—" },
    { label: "التراكمي", value: cumulative ?? "—" },
    { label: "ساعة", value: term.credit_hours.toLocaleString("ar-u-nu-latn") },
    { label: "ناجح", value: `${passed}/${term.results.length}` },
  ];
  return (
    <Card className="mt-4 grid grid-cols-4 divide-x divide-border-soft">
      {stats.map((s) => (
        <div key={s.label} className="px-2 py-3 text-center">
          <p className="text-lg font-bold text-text">{s.value}</p>
          <p className="text-xs text-text-muted">{s.label}</p>
        </div>
      ))}
    </Card>
  );
}

function TermRows({ term, show }: { term: Term; show: Record<string, boolean> }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-xs font-semibold text-text-muted">المقررات</h2>
        {term.published_at && (
          <span className="text-xs text-text-muted">
            نُشرت {date.format(new Date(term.published_at))}
          </span>
        )}
      </div>
      {/* Phone: cards */}
      <Card className="divide-y divide-border-soft lg:hidden">
        {term.results.map((r) => {
          const [top, bottom] = splitCode(r.course_code);
          return (
            <div key={r.course_code} className="flex items-center gap-3 px-4 py-3">
              <CodeTile top={top} bottom={bottom} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{r.course_name}</p>
                <p className="text-xs text-text-muted">
                  {r.course_code} · {count(r.credit_hours, N.hour)}
                  {r.correction_pending && " · طلب تعديل قيد النظر"}
                </p>
              </div>
              <div className="text-end">
                {show.letter && (
                  <p className="text-lg font-bold text-text" dir="ltr">
                    {r.letter || "—"}
                  </p>
                )}
                {show.score && (
                  <p className="text-xs text-text-muted">
                    {r.score != null ? mark(r.score) : STATUS_LABELS[r.status]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </Card>
      {/* Desktop: table */}
      <Card className="hidden overflow-hidden lg:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-xs text-text-muted">
            <tr>
              <th className="px-4 py-2.5 text-start font-medium">المادة</th>
              <th className="px-3 py-2.5 font-medium">الساعات</th>
              {show.score && <th className="px-3 py-2.5 font-medium">المجموع</th>}
              {show.letter && <th className="px-3 py-2.5 font-medium">التقدير</th>}
              {show.points && <th className="px-3 py-2.5 font-medium">النقاط</th>}
              <th className="px-4 py-2.5 text-start font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {term.results.map((r) => (
              <tr key={r.course_code}>
                <td className="px-4 py-3">
                  <span className="font-semibold text-text">{r.course_name}</span>
                  <bdi dir="ltr" className="ms-2 text-xs text-text-muted">
                    {r.course_code}
                  </bdi>
                </td>
                <td className="px-3 text-center">{r.credit_hours}</td>
                {show.score && (
                  <td className="px-3 text-center">{r.score != null ? mark(r.score) : "—"}</td>
                )}
                {show.letter && (
                  <td className="px-3 text-center font-bold" dir="ltr">
                    {r.letter || "—"}
                  </td>
                )}
                {show.points && <td className="px-3 text-center">{r.grade_points ?? "—"}</td>}
                <td className="px-4">
                  {r.correction_pending ? (
                    <StatusBadge status="pending" label="طلب تعديل قيد النظر" />
                  ) : (
                    <StatusBadge status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-alt text-sm font-semibold">
            <tr>
              <td className="px-4 py-2.5">المعدل الفصلي</td>
              <td className="px-3 text-center">{term.credit_hours}</td>
              <td colSpan={4} className="px-4 text-start">
                {term.gpa ?? "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </section>
  );
}
