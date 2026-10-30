import { BookOpen } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Avatar, Card, CourseCode, EmptyState } from "../../components/ui";
import { useMe } from "../../lib/auth";
import { dueLabel, taskState, useAssignments, useLectures, useMyCourses } from "../../lib/learning";
import { count, N } from "../../lib/format";
import { initials } from "../../lib/reports";
import { useGradingQueue } from "./Grading";

/** Boards: StudentCourses, TeacherCourses (phone); desktop derived. A card per course, two
 *  across on large screens: name and details, who teaches it, its figures in words, and the
 *  next thing to do; no tinted tiles (owner, 2026-10-29) — details added 2026-10-30. */
export function Courses() {
  const me = useMe();
  const courses = useMyCourses();
  const assignments = useAssignments();
  const lectures = useLectures("all");
  const student = !!me.data?.student;
  // Hand-ins waiting for grading, for the teacher's cards (not asked for a student).
  const queue = useGradingQueue("pending", !student);
  const list = courses.data ?? [];
  const hours = list.reduce((n, c) => n + c.credit_hours, 0);
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
        // One card per course (owner, 2026-10-30: «حسّن الكرت وأضف تفاصيل»): who teaches it, the
        // course's figures as plain words, and the one line that matters next — the next
        // assignment for a student, the hand-ins waiting for grading for its teacher.
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((c) => {
            const mine = (assignments.data ?? []).filter((a) => a.offering === c.offering_id);
            const next = mine
              .filter((a) => ["late", "today", "week"].includes(taskState(a)))
              .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
            const late = mine.filter((a) => taskState(a) === "late").length;
            const published = (lectures.data ?? []).filter(
              (l) => l.offering === c.offering_id && l.is_published,
            ).length;
            const lead = c.instructors.find((i) => i.role === "teacher")?.user;
            const teacher = lead?.full_name_ar;
            const tas = c.instructors.filter((i) => i.role === "ta").length;
            const handed = mine.filter((a) => a.mine).length;
            const waiting = (queue.data?.groups ?? [])
              .filter((g) => g.assignment.course_code === c.code)
              .reduce((n, g) => n + g.submissions.length, 0);
            const n = (v: number) => v.toLocaleString("ar-u-nu-latn");
            // One word of state, only when something asks for attention (no «منتظم» pill).
            const state = student
              ? late
                ? { text: `متأخر ${n(late)}`, tone: "text-danger-strong" }
                : next && taskState(next) === "today"
                  ? { text: "مطلوب اليوم", tone: "text-warning-strong" }
                  : null
              : waiting
                ? { text: `${n(waiting)} للتصحيح`, tone: "text-warning-strong" }
                : null;
            return (
              <Link
                key={c.offering_id}
                to={`/courses/${c.offering_id}`}
                className="flex flex-col rounded-xl border border-border-soft bg-surface p-4 shadow-xs transition-colors hover:border-border hover:bg-surface-alt"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-base font-bold leading-snug text-text">
                      {c.name_ar}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      <CourseCode code={c.code} /> · شعبة <bdi>{c.section}</bdi> ·{" "}
                      {count(c.credit_hours, N.hour)}
                    </span>
                  </span>
                  {state && (
                    <span className={`shrink-0 text-xs font-semibold ${state.tone}`}>
                      {state.text}
                    </span>
                  )}
                </span>
                <span className="mt-3 flex items-center gap-2 text-sm text-text">
                  <Avatar
                    text={initials(student ? (teacher ?? "—") : (me.data?.full_name_ar ?? ""))}
                    size="sm"
                    tone="neutral"
                    photo={student ? lead?.photo : me.data?.photo}
                  />
                  <span className="min-w-0 truncate">
                    {student
                      ? (teacher ?? "بلا أستاذ")
                      : `${c.my_role === "ta" ? "معيد" : "أستاذ"}${tas && c.my_role !== "ta" ? ` · ${count(tas, N.ta)}` : ""}`}
                  </span>
                </span>
                <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border-soft pt-3 text-xs text-text-muted">
                  {!student && (
                    <span className="font-semibold text-text">
                      {count(c.students_count, N.student)}
                    </span>
                  )}
                  <span>{count(published, N.lecture)} منشورة</span>
                  <span>{count(mine.length, N.assignment)}</span>
                  {student && mine.length > 0 && (
                    <span>
                      سلّمتَ <b className="text-text">{n(handed)}</b> من {n(mine.length)}
                    </span>
                  )}
                </span>
                <span className="mt-2 block truncate text-sm text-text-muted">
                  {student
                    ? next
                      ? `القادم: ${dueLabel(next.due_at)} — ${next.title}`
                      : "لا واجبات قادمة"
                    : waiting
                      ? `بانتظار التصحيح: ${count(waiting, N.submission)}`
                      : "لا تسليمات بانتظار التصحيح"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
