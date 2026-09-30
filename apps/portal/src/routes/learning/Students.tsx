import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { FilterBar, Button, Card, Chip, ScrollRegion } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useCourse } from "../../lib/learning";
import { downloadCsv, initials } from "../../lib/reports";

/** Boards: TeacherStudents + TeacherGradebook (phone), DesktopTeacherGradebook — the students as a
 *  table on large screens; the gradebook with the same filters, pending cells and averages. */
export function Students() {
  const { id = "" } = useParams();
  const offering = Number(id);
  const course = useCourse(offering).data;
  const book = useQuery({
    queryKey: ["gradebook", offering],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/gradebooks/{offering_id}", {
          params: { path: { offering_id: offering } },
        }),
      ) ?? null,
  });
  const [view, setView] = useState<"list" | "book">("list");
  const [filter, setFilter] = useState<"all" | "missing" | "low" | "idle">("all");
  const [q, setQ] = useState("");
  const [lowestFirst, setLowestFirst] = useState(false);
  const b = book.data;
  const max = Number(b?.max_total ?? 0);
  const pct = (total: string) => (max ? Math.round((100 * Number(total)) / max) : 0);
  const last = b?.assignments.at(-1);
  const rows = (b?.students ?? [])
    .filter((s) => {
      if (q && !s.full_name_ar.includes(q) && !s.university_number.includes(q)) return false;
      if (filter === "missing") return !!last && !s.cells[last.public_id];
      if (filter === "low") return max > 0 && pct(s.total) < 50;
      if (filter === "idle") return s.submitted === 0;
      return true;
    })
    .sort((x, y) => (lowestFirst ? Number(x.total) - Number(y.total) : 0));
  const count = b?.assignments.length ?? 0;
  // The gradebook's footer (board DesktopTeacherGradebook): each column's average.
  const average = (values: number[]) =>
    values.length ? values.reduce((n, v) => n + v, 0) / values.length : null;
  const fmt = (n: number | null, digits = 1) =>
    n === null ? "—" : (Math.round(n * 10 ** digits) / 10 ** digits).toLocaleString("ar-u-nu-latn");
  const avg = b?.students.length
    ? Math.round(b.students.reduce((n, s) => n + pct(s.total), 0) / b.students.length)
    : 0;
  const csv = () =>
    b &&
    downloadCsv(
      `gradebook-${course?.code ?? offering}`,
      [
        "الرقم الجامعي",
        "الاسم",
        ...b.assignments.map((a) => `${a.title} /${Number(a.max_grade)}`),
        `المجموع /${max}`,
      ],
      b.students.map((s) => [
        s.university_number,
        s.full_name_ar,
        ...b.assignments.map((a) => s.cells[a.public_id]?.score ?? ""),
        s.total,
      ]),
    );
  const filterbar = (
    <FilterBar>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="بحث بالاسم أو الرقم الجامعي"
        aria-label="بحث بالاسم أو الرقم الجامعي"
        className="mt-3 block min-h-10 w-full rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          الكل
        </Chip>
        {last && (
          <Chip active={filter === "missing"} onClick={() => setFilter("missing")}>
            لم يسلّموا {last.title}
          </Chip>
        )}
        <Chip active={filter === "low"} onClick={() => setFilter("low")}>
          تحت 50٪
        </Chip>
        <Chip active={filter === "idle"} onClick={() => setFilter("idle")}>
          بلا أي نشاط
        </Chip>
        <Chip active={lowestFirst} onClick={() => setLowestFirst(!lowestFirst)}>
          الأقل مجموعًا أولًا
        </Chip>
      </div>
    </FilterBar>
  );
  return (
    <PortalShell
      title={
        view === "list"
          ? `الطلاب · ${(b?.students.length ?? 0).toLocaleString("ar-u-nu-latn")}`
          : "دفتر الدرجات"
      }
      subtitle={
        course
          ? `${course.name_ar} · شعبة ⁨${course.section}⁩ · متوسط أعمال الفصل ${avg.toLocaleString("ar-u-nu-latn")}٪ من ${max.toLocaleString("ar-u-nu-latn")}`
          : undefined
      }
      back={{ label: course?.name_ar ?? "المادة", to: `/courses/${offering}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={view === "list"} onClick={() => setView("list")}>
          الطلاب
        </Chip>
        <Chip active={view === "book"} onClick={() => setView("book")}>
          دفتر الدرجات
        </Chip>
        <Button variant="secondary" className="ms-auto min-h-9 px-3" onClick={csv}>
          <FileDown size={16} aria-hidden /> CSV
        </Button>
      </div>
      {filterbar}
      {view === "list" ? (
        <>
          <Card className="mt-3 hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-xs text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start font-medium">
                    الطالب
                  </th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">
                    التسليم
                  </th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">
                    {last ? last.title : "آخر واجب"}
                  </th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">
                    المجموع /{max.toLocaleString("ar-u-nu-latn")}
                  </th>
                  <th scope="col" className="w-40 px-4 py-2 text-start font-medium">
                    ٪
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {rows.map((s) => {
                  const cell = last ? s.cells[last.public_id] : undefined;
                  const p = pct(s.total);
                  return (
                    <tr key={s.public_id}>
                      <th scope="row" className="px-4 py-2.5 text-start font-normal">
                        <span className="flex items-center gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                            {initials(s.full_name_ar)}
                          </span>
                          <span>
                            <b className="block text-text">{s.full_name_ar}</b>
                            <bdi className="text-xs text-text-muted">{s.university_number}</bdi>
                          </span>
                        </span>
                      </th>
                      <td className="px-4 py-2.5 text-text-muted">
                        {s.submitted.toLocaleString("ar-u-nu-latn")}/
                        {count.toLocaleString("ar-u-nu-latn")}
                      </td>
                      <td className="px-4 py-2.5">
                        {cell ? (
                          <Link
                            to={`/submissions/${cell.submission}`}
                            className="text-primary hover:underline"
                          >
                            {cell.score != null
                              ? Number(cell.score).toLocaleString("ar-u-nu-latn")
                              : "مُعلّق"}
                          </Link>
                        ) : (
                          <span className="text-text-muted">لم يسلّم</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-text">
                        {Number(s.total).toLocaleString("ar-u-nu-latn")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                            <span
                              className={`block h-full rounded-full ${p < 50 ? "bg-danger" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, p)}%` }}
                            />
                          </span>
                          <b
                            className={`w-10 text-end text-xs ${max && p < 50 ? "text-danger-strong" : "text-text"}`}
                          >
                            {max ? `${p.toLocaleString("ar-u-nu-latn")}٪` : "—"}
                          </b>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا طلاب.</p>}
          </Card>
          <Card className="mt-3 divide-y divide-border-soft lg:hidden">
            {rows.map((s) => (
              <div key={s.public_id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                  {initials(s.full_name_ar)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{s.full_name_ar}</b>
                  <bdi className="text-xs text-text-muted">{s.university_number}</bdi>
                </span>
                <span
                  className={`text-sm font-bold ${max && pct(s.total) < 50 ? "text-danger-strong" : "text-text"}`}
                >
                  {max ? `${pct(s.total).toLocaleString("ar-u-nu-latn")}٪` : "—"}
                </span>
              </div>
            ))}
            {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا طلاب.</p>}
          </Card>
        </>
      ) : (
        <Card className="mt-3">
          <ScrollRegion label="درجات الطلاب">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-alt text-xs text-text-muted">
                <tr>
                  <th className="sticky start-0 bg-surface-alt px-3 py-2 text-start font-normal">
                    الطالب
                  </th>
                  {b?.assignments.map((a) => (
                    <th key={a.public_id} className="px-3 py-2 text-start font-normal">
                      {a.title} /{Number(a.max_grade).toLocaleString("ar-u-nu-latn")}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-start font-normal">
                    المجموع /{max.toLocaleString("ar-u-nu-latn")}
                  </th>
                  <th className="px-3 py-2 text-start font-normal">٪</th>
                  <th className="px-3 py-2 text-start font-normal">التسليم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {rows.map((s) => (
                  <tr key={s.public_id}>
                    <td className="sticky start-0 bg-surface px-3 py-2 font-semibold">
                      {s.full_name_ar}
                    </td>
                    {(b?.assignments ?? []).map((a) => {
                      const c = s.cells[a.public_id];
                      return (
                        <td
                          key={a.public_id}
                          className={`px-3 py-2 ${
                            c && c.score == null
                              ? "bg-info-soft text-info-strong"
                              : c?.status === "suggested"
                                ? "bg-warning-soft text-warning-strong"
                                : c?.late
                                  ? "text-warning-strong"
                                  : ""
                          }`}
                        >
                          {c ? (
                            <Link to={`/submissions/${c.submission}`} className="hover:underline">
                              {c.score != null
                                ? Number(c.score).toLocaleString("ar-u-nu-latn")
                                : "مُعلّق"}
                              {c.status === "suggested" ? "*" : ""}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-bold">
                      {Number(s.total).toLocaleString("ar-u-nu-latn")}
                    </td>
                    <td
                      className={`px-3 py-2 font-semibold ${max && pct(s.total) < 50 ? "text-danger-strong" : ""}`}
                    >
                      {max ? `${pct(s.total).toLocaleString("ar-u-nu-latn")}٪` : "—"}
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {s.submitted.toLocaleString("ar-u-nu-latn")}/
                      {count.toLocaleString("ar-u-nu-latn")}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-surface-alt text-xs font-bold">
                  <tr>
                    <th scope="row" className="sticky start-0 bg-surface-alt px-3 py-2 text-start">
                      المتوسط · {rows.length.toLocaleString("ar-u-nu-latn")}
                    </th>
                    {b?.assignments.map((a) => (
                      <td key={a.public_id} className="px-3 py-2">
                        {fmt(
                          average(
                            rows
                              .map((s) => s.cells[a.public_id]?.score)
                              .filter((v): v is string => v != null)
                              .map(Number),
                          ),
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">{fmt(average(rows.map((s) => Number(s.total))))}</td>
                    <td className="px-3 py-2">
                      {max ? `${fmt(average(rows.map((s) => pct(s.total))), 0)}٪` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {count
                        ? `${fmt(average(rows.map((s) => (100 * s.submitted) / count)), 0)}٪`
                        : "—"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            <p className="px-3 py-2 text-xs text-text-muted">
              * اقتراح آلي بانتظار الاعتماد · «مُعلّق» سُلِّم ولم يُصحَّح · — لم يُسلَّم · المتأخر
              باللون الكهرماني
            </p>
          </ScrollRegion>
        </Card>
      )}
    </PortalShell>
  );
}
