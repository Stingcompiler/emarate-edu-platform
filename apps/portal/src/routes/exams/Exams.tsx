import type { Schemas } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  CodeTile,
  EmptyState,
  SectionLabel,
  StatusBadge,
  splitCode,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { count, N } from "../../lib/format";
import { ALL, Pager, useLocalPages } from "../../components/Pager";

type Exam = Schemas["Exam"];
const when = new Intl.DateTimeFormat("ar", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function examPhase(exam: Exam, now = Date.now()): { key: string; label: string } {
  if (exam.status === "draft") return { key: "draft", label: "مسودة" };
  if (
    exam.status === "closed" ||
    exam.status === "archived" ||
    new Date(exam.closes_at).getTime() <= now
  )
    return { key: "closed", label: "منتهٍ" };
  if (attemptsUsedUp(exam)) return { key: "closed", label: "أنهيته" };
  if (new Date(exam.opens_at).getTime() > now) return { key: "open", label: "مجدول" };
  return { key: "published", label: "جارٍ الآن" };
}

/** Student only: every allowed attempt is finished, so nothing is left to do. */
function attemptsUsedUp(exam: Exam): boolean {
  const mine = (exam.my_attempts ?? []) as { status: string }[];
  if (!mine.length || mine.some((a) => a.status === "in_progress")) return false;
  return mine.length >= (exam.max_attempts ?? 1);
}

/** Student: upcoming, open and done exams. Staff: exams of their courses. Desktop board: DesktopDeptExams. */
export function Exams() {
  const me = useMe();
  const staff = !me.data?.student;
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: async () =>
      (await api.GET("/api/v1/exams", { params: { query: ALL } })).data?.results ?? [],
  });
  const list = exams.data ?? [];
  const now = Date.now();
  const groups = [
    { key: "published", label: "جارٍ الآن" },
    { key: "open", label: "قادمة" },
    { key: "draft", label: "مسودات" },
    { key: "closed", label: "منتهية" },
  ];
  // 10 at a time, in the order the groups appear (live, upcoming, drafts, ended).
  const ordered = groups.flatMap((g) => list.filter((e) => examPhase(e, now).key === g.key));
  const paged = useLocalPages(ordered);
  return (
    <PortalShell
      title="الاختبارات"
      titleAction={
        staff ? (
          <Link to="/exams/new">
            <Button className="min-h-9 px-3">
              <Plus size={16} aria-hidden />
              اختبار
            </Button>
          </Link>
        ) : undefined
      }
    >
      {list.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {groups.map((g) => (
            <Card key={g.key} className="p-3">
              <p className="text-xl font-bold text-text">
                {list.filter((e) => examPhase(e, now).key === g.key).length}
              </p>
              <p className="text-xs text-text-muted">{g.label}</p>
            </Card>
          ))}
        </div>
      )}
      <div>
        {!list.length && !exams.isPending && (
          <Card>
            <EmptyState icon={<ClipboardList size={24} aria-hidden />} title="لا اختبارات بعد" />
          </Card>
        )}
        {groups.map((g) => {
          const rows = paged.shown.filter((e) => examPhase(e, now).key === g.key);
          if (!rows.length) return null;
          return (
            <section key={g.key}>
              <SectionLabel>{g.label}</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {rows.map((exam) => {
                  const [top, bottom] = splitCode(exam.course_code);
                  const phase = examPhase(exam, now);
                  return (
                    <Link
                      key={exam.public_id}
                      to={`/exams/${exam.public_id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                    >
                      <CodeTile top={top} bottom={bottom} />
                      <span className="min-w-0 flex-1 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_6rem] lg:items-center lg:gap-4">
                        <span className="block min-w-0">
                          <span className="block truncate text-sm font-semibold text-text">
                            {exam.title}
                          </span>
                          {/* Phones: one meta line; desktop: its own columns (DesktopDeptExams). */}
                          <span className="text-xs text-text-muted lg:hidden">
                            {exam.course_name} · {when.format(new Date(exam.opens_at))} ·{" "}
                            {count(exam.duration_minutes, N.minute)}
                          </span>
                          <span className="hidden truncate text-xs text-text-muted lg:block">
                            {exam.course_name}
                          </span>
                        </span>
                        <span className="hidden text-sm text-text lg:block">
                          {when.format(new Date(exam.opens_at))}
                        </span>
                        <span className="hidden text-sm text-text-muted lg:block">
                          {count(exam.duration_minutes, N.minute)}
                        </span>
                        <span className="hidden lg:block">
                          <StatusBadge status={phase.key} label={phase.label} />
                        </span>
                      </span>
                      <span className="lg:hidden">
                        <StatusBadge status={phase.key} label={phase.label} />
                      </span>
                    </Link>
                  );
                })}
              </Card>
            </section>
          );
        })}
      </div>
      <Pager page={paged.page} count={paged.count} onPage={paged.setPage} />
    </PortalShell>
  );
}
