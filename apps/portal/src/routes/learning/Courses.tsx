import { BookOpen } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, CodeTile, EmptyState } from "../../components/ui";
import { useMe } from "../../lib/auth";
import {
  dueLabel,
  taskState,
  useAssignments,
  useLectures,
  useMyCourses,
  splitCourse,
} from "../../lib/learning";

/** Boards: StudentCourses, TeacherCourses (phone); desktop derived — a card grid. */
export function Courses() {
  const me = useMe();
  const courses = useMyCourses();
  const assignments = useAssignments();
  const lectures = useLectures();
  const list = courses.data ?? [];
  const hours = list.reduce((n, c) => n + c.credit_hours, 0);
  const student = !!me.data?.student;
  return (
    <PortalShell
      title="موادي"
      subtitle={
        list.length
          ? `${list[0]!.term}${student && me.data?.student ? ` · المستوى ${me.data.student.level}` : ""} · ${list.length.toLocaleString("ar")} مواد${student ? ` · ${hours.toLocaleString("ar")} ساعة` : ""}`
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
            return (
              <Link key={c.offering_id} to={`/courses/${c.offering_id}`} className="block">
                <Card className="flex h-full flex-col p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <CodeTile top={top} bottom={bottom} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text">{c.name_ar}</p>
                      <p className="text-xs text-text-muted">
                        {teacher ?? "بلا أستاذ"} · شعبة <bdi>{c.section}</bdi> ·{" "}
                        {c.credit_hours.toLocaleString("ar")} ساعات
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
                  <div className="mt-auto flex items-center justify-between pt-3 text-xs">
                    <span className="text-text-muted">
                      المحاضرات المنشورة: {published.toLocaleString("ar")}
                    </span>
                    {student &&
                      (late ? (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger-strong">
                          متأخر {late.toLocaleString("ar")}
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
