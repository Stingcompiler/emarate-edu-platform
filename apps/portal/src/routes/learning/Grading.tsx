import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, Chip, EmptyState, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { when } from "../../lib/format";
import { initials } from "../../lib/reports";

type Status = "pending" | "suggested" | "late" | "done";

export function useGradingQueue(status: Status = "pending") {
  return useQuery({
    queryKey: ["grading", status],
    queryFn: async () =>
      (await api.GET("/api/v1/grading-queue", { params: { query: { status } } })).data ?? null,
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
      subtitle={`${counts.pending.toLocaleString("ar")} بانتظارك · ${counts.suggested.toLocaleString("ar")} باقتراح آلي جاهز للاعتماد`}
    >
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
            {l} {counts[k].toLocaleString("ar")}
          </Chip>
        ))}
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {(q?.groups ?? []).map(({ assignment: a, submissions }) => (
          <section key={a.public_id}>
            <SectionLabel>
              <bdi>{a.course_code}</bdi> · {a.title} · {submissions.length.toLocaleString("ar")}
            </SectionLabel>
            <Card className="divide-y divide-border-soft">
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
                        ? ` · إعادة تسليم — الإصدار ${r.versions_count.toLocaleString("ar")}`
                        : ""}
                      {r.is_late ? " · متأخر" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold">
                    {r.grade?.status === "approved" ? (
                      <span className="text-success-strong">
                        {Number(r.grade.final_score).toLocaleString("ar")}/
                        {Number(a.max_grade).toLocaleString("ar")}
                      </span>
                    ) : r.grade ? (
                      <span className="text-warning-strong">
                        {Number(r.grade.score).toLocaleString("ar")} مقترح
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
