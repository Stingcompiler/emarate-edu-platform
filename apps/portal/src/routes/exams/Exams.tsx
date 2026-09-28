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
    queryFn: async () => (await api.GET("/api/v1/exams")).data?.results ?? [],
  });
  const list = exams.data ?? [];
  const now = Date.now();
  const groups = [
    { key: "published", label: "جارٍ الآن" },
    { key: "open", label: "قادمة" },
    { key: "draft", label: "مسودات" },
    { key: "closed", label: "منتهية" },
  ];
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
      <div className="max-w-3xl">
        {!list.length && !exams.isPending && (
          <Card>
            <EmptyState icon={<ClipboardList size={24} aria-hidden />} title="لا اختبارات بعد" />
          </Card>
        )}
        {groups.map((g) => {
          const rows = list.filter((e) => examPhase(e, now).key === g.key);
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text">
                          {exam.title}
                        </span>
                        <span className="text-xs text-text-muted">
                          {exam.course_name} · {when.format(new Date(exam.opens_at))} ·{" "}
                          {exam.duration_minutes.toLocaleString("ar")} دقيقة
                        </span>
                      </span>
                      <StatusBadge status={phase.key} label={phase.label} />
                    </Link>
                  );
                })}
              </Card>
            </section>
          );
        })}
      </div>
    </PortalShell>
  );
}
