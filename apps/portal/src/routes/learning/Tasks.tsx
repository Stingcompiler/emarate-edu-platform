import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { ProgressRing } from "../../components/motion";
import { Card, CodeTile, EmptyState, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import {
  type TaskState,
  dueLabel,
  splitCourse,
  taskState,
  useAssignments,
} from "../../lib/learning";
import { examPhase } from "../exams/Exams";
import { type Noun, count, N } from "../../lib/format";
import { ALL } from "../../components/Pager";

const GROUPS: { key: TaskState[]; label: string }[] = [
  { key: ["late"], label: "متأخر" },
  { key: ["today"], label: "اليوم" },
  { key: ["week"], label: "هذا الأسبوع" },
  { key: ["later"], label: "لاحقًا" },
  { key: ["submitted", "graded"], label: "مكتمل" },
];

const UPCOMING: Noun = {
  one: "مهمة قادمة",
  two: "مهمتان قادمتان",
  few: "مهام قادمة",
  many: "مهمة قادمة",
};

/** Board: StudentTasks (phone); desktop derived — groups in two columns. */
export function Tasks() {
  const assignments = useAssignments();
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: async () =>
      (await api.GET("/api/v1/exams", { params: { query: ALL } })).data?.results ?? [],
  });
  const now = Date.now();
  const list = (assignments.data ?? [])
    .filter((a) => a.status !== "draft")
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const upcomingExams = (exams.data ?? []).filter(
    (e) => e.status === "published" && examPhase(e, now).key !== "closed",
  );
  const open = list.filter((a) => !["submitted", "graded"].includes(taskState(a)));
  return (
    <PortalShell
      title="المهام"
      subtitle={`${count(open.length, UPCOMING)}${upcomingExams.length ? ` · ${count(upcomingExams.length, N.exam)}` : ""}`}
      titleAction={
        list.length > 0 ? (
          <ProgressRing
            value={list.length - open.length}
            max={list.length}
            label={`أنجزت ${(list.length - open.length).toLocaleString("ar")} من ${list.length.toLocaleString("ar")}`}
          >
            {`${(list.length - open.length).toLocaleString("ar")}/${list.length.toLocaleString("ar")}`}
          </ProgressRing>
        ) : undefined
      }
    >
      {!list.length && !upcomingExams.length ? (
        <Card>
          <EmptyState icon={<CheckCircle2 size={24} aria-hidden />} title="لا مهام الآن" />
        </Card>
      ) : (
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">
          {GROUPS.map((g) => {
            const items = list.filter((a) => g.key.includes(taskState(a, now)));
            if (!items.length && !(g.key.includes("week") && upcomingExams.length)) return null;
            return (
              <section key={g.label}>
                <SectionLabel>
                  {g.label} · {items.length.toLocaleString("ar")}
                </SectionLabel>
                <Card className="motion-stagger divide-y divide-border-soft">
                  {items.map((a) => {
                    const [top, bottom] = splitCourse(a.course_code);
                    const state = taskState(a, now);
                    return (
                      <Link
                        key={a.public_id}
                        to={`/assignments/${a.public_id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                      >
                        <CodeTile top={top} bottom={bottom} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-text">{a.title}</span>
                          <span className="text-xs text-text-muted">
                            {a.course_name} · {count(Number(a.max_grade), N.mark)}
                            {state === "late" && a.late_policy === "penalty"
                              ? ` · خصم ${a.late_penalty_percent}٪`
                              : ""}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-xs font-semibold ${state === "late" ? "text-danger-strong" : state === "graded" ? "text-success-strong" : "text-text-muted"}`}
                        >
                          {state === "graded"
                            ? `${Number(a.mine!.score).toLocaleString("ar")}/${Number(a.max_grade).toLocaleString("ar")}`
                            : state === "submitted"
                              ? "سُلِّم"
                              : dueLabel(a.due_at, now)}
                        </span>
                      </Link>
                    );
                  })}
                  {g.key.includes("week") &&
                    upcomingExams.map((e) => (
                      <Link
                        key={e.public_id}
                        to={`/exams/${e.public_id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                      >
                        <CodeTile
                          top={splitCourse(e.course_code)[0]}
                          bottom={splitCourse(e.course_code)[1]}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-text">{e.title}</span>
                          <span className="text-xs text-text-muted">
                            اختبار · {count(e.duration_minutes, N.minute)} ·{" "}
                            {count(e.questions_count, N.question)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-warning-strong">
                          {new Date(e.opens_at).getTime() <= now
                            ? "مفتوح الآن"
                            : dueLabel(e.opens_at, now)}
                        </span>
                      </Link>
                    ))}
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
