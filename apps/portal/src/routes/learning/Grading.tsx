import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { ProgressRing } from "../../components/motion";
import { FilterBar, Card, Chip, EmptyState, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when } from "../../lib/format";
import { initials } from "../../lib/reports";

type Status = "pending" | "suggested" | "late" | "done";

export function useGradingQueue(status: Status = "pending") {
  return useQuery({
    queryKey: ["grading", status],
    queryFn: async () =>
      ok(await api.GET("/api/v1/grading-queue", { params: { query: { status } } })) ?? null,
  });
}

/** Board: TeacherGrading (phone); desktop derived — groups side by side. Oldest first, one request. */
export function Grading() {
  const [filter, setFilter] = useState<Status>("pending");
  const queue = useGradingQueue(filter);
  const q = queue.data;
  const counts = q?.counts ?? { pending: 0, suggested: 0, late: 0, done: 0 };
  return (
    <PortalShell
      title="التصحيح"
      subtitle={`${counts.pending.toLocaleString("ar-u-nu-latn")} بانتظارك · ${counts.suggested.toLocaleString("ar-u-nu-latn")} باقتراح آلي جاهز للاعتماد`}
      titleAction={
        counts.done + counts.pending > 0 ? (
          <ProgressRing
            value={counts.done}
            max={counts.done + counts.pending}
            label={`صُحّح ${counts.done.toLocaleString("ar-u-nu-latn")} من ${(counts.done + counts.pending).toLocaleString("ar-u-nu-latn")}`}
          >
            {`${Math.round((counts.done / (counts.done + counts.pending)) * 100).toLocaleString("ar-u-nu-latn")}٪`}
          </ProgressRing>
        ) : undefined
      }
    >
      <FilterBar>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["pending", "بانتظار"],
              ["suggested", "باقتراح آلي"],
              ["late", "متأخر"],
              ["done", "مصحح"],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {l} {counts[k].toLocaleString("ar-u-nu-latn")}
            </Chip>
          ))}
        </div>
      </FilterBar>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {(q?.groups ?? []).map(({ assignment: a, submissions }) => (
          <section key={a.public_id}>
            <SectionLabel>
              <bdi>{a.course_code}</bdi> · {a.title} ·{" "}
              {submissions.length.toLocaleString("ar-u-nu-latn")}
            </SectionLabel>
            <Card className="motion-stagger divide-y divide-border-soft">
              {submissions.map((r) => (
                <Link
                  key={r.public_id}
                  to={`/submissions/${r.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                    {initials(r.student.full_name_ar)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-text">{r.student.full_name_ar}</b>
                    <span className="text-xs text-text-muted">
                      {when(r.current_version?.submitted_at ?? r.first_submitted_at)}
                      {r.versions_count > 1
                        ? ` · إعادة تسليم — الإصدار ${r.versions_count.toLocaleString("ar-u-nu-latn")}`
                        : ""}
                      {r.is_late ? " · متأخر" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold">
                    {r.grade?.status === "approved" ? (
                      <span className="text-success-strong">
                        {Number(r.grade.final_score).toLocaleString("ar-u-nu-latn")}/
                        {Number(a.max_grade).toLocaleString("ar-u-nu-latn")}
                      </span>
                    ) : r.grade ? (
                      <span className="text-warning-strong">
                        {Number(r.grade.score).toLocaleString("ar-u-nu-latn")} مقترح
                      </span>
                    ) : (
                      <span className="text-primary">جديد</span>
                    )}
                  </span>
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
      {q && !q.groups.length && (
        <Card className="mt-4">
          <EmptyState icon={<CheckCircle2 size={24} aria-hidden />} title="لا شيء هنا" />
        </Card>
      )}
    </PortalShell>
  );
}
