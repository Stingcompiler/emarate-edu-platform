import { BookOpen } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, CodeTile, EmptyState, COURSE_TONES } from "../../components/ui";
import { useMe } from "../../lib/auth";
import {
  dueLabel,
  taskState,
  useAssignments,
  useLectures,
  useMyCourses,
  splitCourse,
  courseTone,
} from "../../lib/learning";
import { count, N } from "../../lib/format";

/** Boards: StudentCourses, TeacherCourses (phone); desktop derived — a card grid, each course
 *  in its own colour with the student's progress (review 2026-09-29 PR 7). */
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
            const [top, bottom] = splitCourse(c.code);
            const tone = courseTone(c.code);
            // Progress: a student's work handed in; a teacher's lectures published so far.
            const handed = mine.filter((a) => a.mine).length;
            const progress = student
              ? { done: handed, of: mine.length, label: "الأعمال المسلّمة" }
              : null;
            return (
              <Link key={c.offering_id} to={`/courses/${c.offering_id}`} className="block">
                <Card className="relative flex h-full flex-col overflow-hidden p-4 transition-shadow hover:shadow-md">
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-1 ${COURSE_TONES[tone]} [background:currentColor]`}
                  />
                  <div className="flex items-start gap-3">
                    <CodeTile top={top} bottom={bottom} tone={tone} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text">{c.name_ar}</p>
                      <p className="text-xs text-text-muted">
                        {teacher ?? "بلا أستاذ"} · شعبة <bdi>{c.section}</bdi> ·{" "}
                        {count(c.credit_hours, N.hour)}
                        {c.my_role !== "student"
                          ? ` · ${c.my_role === "ta" ? "معيد" : "أستاذ"}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  {next && (
                    <p className="mt-3 rounded-lg bg-surface-alt px-3 py-2 text-xs text-text">
                      {next.title} — {dueLabel(next.due_at)}
                    </p>
                  )}
                  {progress && progress.of > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-text-muted">
                        <span>{progress.label}</span>
                        <span>
                          {progress.done.toLocaleString("ar-u-nu-latn")} من{" "}
                          {progress.of.toLocaleString("ar-u-nu-latn")}
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-alt"
                        role="progressbar"
                        aria-label={`${progress.label} — ${c.name_ar}`}
                        aria-valuemin={0}
                        aria-valuemax={progress.of}
                        aria-valuenow={progress.done}
                      >
                        <span
                          className={`motion-grow block h-full rounded-full ${COURSE_TONES[tone]} [background:currentColor]`}
                          style={{ width: `${(100 * progress.done) / progress.of}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-3 text-xs">
                    <span className="text-text-muted">
                      المحاضرات المنشورة: {published.toLocaleString("ar-u-nu-latn")}
                    </span>
                    {student &&
                      (late ? (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger-strong">
                          متأخر {late.toLocaleString("ar-u-nu-latn")}
                        </span>
                      ) : next ? (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning-strong">
                          {taskState(next) === "today" ? "مطلوب اليوم" : "قادم"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success-strong">
                          منتظم
                        </span>
                      ))}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
