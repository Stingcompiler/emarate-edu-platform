import { BookOpen } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, CourseCode, EmptyState } from "../../components/ui";
import { useMe } from "../../lib/auth";
import { dueLabel, taskState, useAssignments, useLectures, useMyCourses } from "../../lib/learning";
import { count, N } from "../../lib/format";

/** Boards: StudentCourses, TeacherCourses (phone); desktop derived. One quiet row per course:
 *  name and details, the next assignment in a line, a word of state only when something needs
 *  attention (owner, 2026-10-29: the coloured cards read as a template). */
export function Courses() {
  const me = useMe();
  const courses = useMyCourses();
  const assignments = useAssignments();
  const lectures = useLectures("all");
  const list = courses.data ?? [];
  const hours = list.reduce((n, c) => n + c.credit_hours, 0);
  const student = !!me.data?.student;
  return (
    <PortalShell
      title="موادي"
      subtitle={
        list.length
          ? `${list[0]!.term}${student && me.data?.student ? ` · المستوى ${me.data.student.level}` : ""} · ${count(list.length, N.course)}${student ? ` · ${count(hours, N.hour)}` : ""}`
          : undefined
      }
    >
      {!list.length && !courses.isPending ? (
        <Card>
          <EmptyState icon={<BookOpen size={24} aria-hidden />} title="لا مواد هذا الفصل" />
        </Card>
      ) : (
        <Card className="divide-y divide-border-soft">
          {list.map((c) => {
            const mine = (assignments.data ?? []).filter((a) => a.offering === c.offering_id);
            const next = mine
              .filter((a) => ["late", "today", "week"].includes(taskState(a)))
              .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
            const late = mine.filter((a) => taskState(a) === "late").length;
            const published = (lectures.data ?? []).filter(
              (l) => l.offering === c.offering_id && l.is_published,
            ).length;
            const teacher = c.instructors.find((i) => i.role === "teacher")?.user.full_name_ar;
            const handed = mine.filter((a) => a.mine).length;
            // One word of state, only when something asks for attention (no «منتظم» pill).
            const state = student
              ? late
                ? {
                    text: `متأخر ${late.toLocaleString("ar-u-nu-latn")}`,
                    tone: "text-danger-strong",
                  }
                : next && taskState(next) === "today"
                  ? { text: "مطلوب اليوم", tone: "text-warning-strong" }
                  : null
              : null;
            return (
              <Link
                key={c.offering_id}
                to={`/courses/${c.offering_id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-4 py-3.5 hover:bg-surface-alt lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_auto] lg:items-center lg:gap-x-6"
              >
                <span className="col-start-1 row-start-1 block min-w-0">
                  <span className="block truncate font-semibold text-text">{c.name_ar}</span>
                  <span className="block text-xs text-text-muted">
                    <CourseCode code={c.code} /> · {teacher ?? "بلا أستاذ"} · شعبة{" "}
                    <bdi>{c.section}</bdi> · {count(c.credit_hours, N.hour)}
                    {c.my_role !== "student" ? ` · ${c.my_role === "ta" ? "معيد" : "أستاذ"}` : ""}
                  </span>
                </span>
                {state && (
                  <span
                    className={`col-start-2 row-start-1 text-xs font-semibold lg:col-start-3 ${state.tone}`}
                  >
                    {state.text}
                  </span>
                )}
                <span className="col-span-2 row-start-2 mt-1.5 block min-w-0 text-sm text-text-muted lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:mt-0">
                  {student && (
                    <span className="block truncate">
                      {next
                        ? `القادم: ${dueLabel(next.due_at)} — ${next.title}`
                        : "لا واجبات قادمة"}
                    </span>
                  )}
                  <span className="block text-xs">
                    {student && mine.length > 0
                      ? `سلّمتَ ${handed.toLocaleString("ar-u-nu-latn")} من ${mine.length.toLocaleString("ar-u-nu-latn")} · `
                      : ""}
                    المحاضرات المنشورة: {published.toLocaleString("ar-u-nu-latn")}
                  </span>
                </span>
              </Link>
            );
          })}
        </Card>
      )}
    </PortalShell>
  );
}
