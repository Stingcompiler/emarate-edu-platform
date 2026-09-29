import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { FilterBar, Button, Card, Chip, ScrollRegion } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useCourse } from "../../lib/learning";
import { downloadCsv, initials } from "../../lib/reports";

/** Boards: TeacherStudents + TeacherGradebook (phone); desktop derived — the gradebook as a table. */
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
  const b = book.data;
  const max = Number(b?.max_total ?? 0);
  const pct = (total: string) => (max ? Math.round((100 * Number(total)) / max) : 0);
  const last = b?.assignments.at(-1);
  const rows = (b?.students ?? []).filter((s) => {
    if (q && !s.full_name_ar.includes(q) && !s.university_number.includes(q)) return false;
    if (filter === "missing") return !!last && !s.cells[last.public_id];
    if (filter === "low") return max > 0 && pct(s.total) < 50;
    if (filter === "idle") return s.submitted === 0;
    return true;
  });
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
  return (
    <PortalShell
      title={
        view === "list"
          ? `الطلاب · ${(b?.students.length ?? 0).toLocaleString("ar")}`
          : "دفتر الدرجات"
      }
      subtitle={
        course
          ? `${course.name_ar} · شعبة ⁨${course.section}⁩ · متوسط أعمال الفصل ${avg.toLocaleString("ar")}٪ من ${max.toLocaleString("ar")}`
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
      {view === "list" ? (
        <>
          <FilterBar>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث بالاسم أو الرقم الجامعي"
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
            </div>
          </FilterBar>
          <Card className="mt-3 divide-y divide-border-soft">
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
                  {max ? `${pct(s.total).toLocaleString("ar")}٪` : "—"}
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
                      {a.title} /{Number(a.max_grade).toLocaleString("ar")}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-start font-normal">
                    المجموع /{max.toLocaleString("ar")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {b?.students.map((s) => (
                  <tr key={s.public_id}>
                    <td className="sticky start-0 bg-surface px-3 py-2 font-semibold">
                      {s.full_name_ar}
                    </td>
                    {b.assignments.map((a) => {
                      const c = s.cells[a.public_id];
                      return (
                        <td
                          key={a.public_id}
                          className={`px-3 py-2 ${c?.late ? "text-warning-strong" : ""}`}
                        >
                          {c ? (
                            <Link to={`/submissions/${c.submission}`} className="hover:underline">
                              {c.score != null ? Number(c.score).toLocaleString("ar") : "✓"}
                              {c.status === "suggested" ? "*" : ""}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-bold">{Number(s.total).toLocaleString("ar")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-text-muted">
              * اقتراح آلي بانتظار الاعتماد · ✓ سُلِّم ولم يُصحَّح · — لم يُسلَّم · المتأخر باللون
              الكهرماني
            </p>
          </ScrollRegion>
        </Card>
      )}
    </PortalShell>
  );
}
