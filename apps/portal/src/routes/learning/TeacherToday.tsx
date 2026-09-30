import { useQuery } from "@tanstack/react-query";
import { BookPlus, ClipboardPlus, Megaphone, Radio } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { COURSE_TONES, Card, CodeTile, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import {
  courseTone,
  dueLabel,
  splitCourse,
  useAssignments,
  useMyCourses,
} from "../../lib/learning";
import { useGradingQueue } from "./Grading";
import { count, N, when } from "../../lib/format";
import { ALL } from "../../components/Pager";

const DAY = 86_400_000;

/** Boards: TeacherToday (phone), DesktopTeacherToday — a notice to acknowledge on top, then the
 *  day's schedule and actions beside the grading queue (by course) and the newest hand-ins. */
export function TeacherToday() {
  const me = useMe();
  const courses = useMyCourses();
  const teaching = (courses.data ?? []).filter((c) => c.my_role !== "student");
  const ids = new Set(teaching.map((c) => c.offering_id));
  const assignments = useAssignments();
  const mine = (assignments.data ?? []).filter((a) => ids.has(a.offering) && a.status !== "draft");
  const queue = useGradingQueue();
  const pending = queue.data?.counts.pending ?? 0;
  // One entry per course: a course with several assignments is counted once.
  const byCourse = [
    ...(queue.data?.groups ?? [])
      .reduce(
        (acc, g) =>
          acc.set(
            g.assignment.course_name,
            (acc.get(g.assignment.course_name) ?? 0) + g.submissions.length,
          ),
        new Map<string, number>(),
      )
      .entries(),
  ].map(([name, n]) => ({ name, n }));
  const live = useQuery({
    queryKey: ["live"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/live-sessions", { params: { query: ALL } }))?.results ?? [],
  });
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/exams", { params: { query: ALL } }))?.results ?? [],
  });
  const notices = useQuery({
    queryKey: ["hr-notices", "mine"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/hr-notices", { params: { query: ALL } }))?.results ?? [],
  });
  const now = Date.now();
  const horizon = now + DAY;
  const students = teaching.length;
  const agenda = [
    ...(live.data ?? [])
      .filter(
        (s) =>
          s.status !== "cancelled" &&
          new Date(s.ends_at).getTime() > now &&
          new Date(s.starts_at).getTime() < horizon,
      )
      .map((s) => ({
        at: s.starts_at,
        now: new Date(s.starts_at).getTime() <= now,
        key: `l${s.public_id}`,
        title: `بث: ${s.course_name || s.title}`,
        meta: s.title,
        to: "/live",
        tag: new Date(s.starts_at).getTime() <= now ? "جارٍ" : dueLabel(s.starts_at, now),
      })),
    ...(exams.data ?? [])
      .filter(
        (e) =>
          e.status === "published" &&
          new Date(e.closes_at).getTime() > now &&
          new Date(e.opens_at).getTime() < horizon,
      )
      .map((e) => ({
        at: e.opens_at,
        now: new Date(e.opens_at).getTime() <= now,
        key: `e${e.public_id}`,
        title: `${e.title} — ${new Date(e.opens_at).getTime() <= now ? "جارٍ" : "يبدأ قريبًا"}`,
        meta: `${e.course_name} · يُغلق ${dueLabel(e.closes_at, now).replace(/^بعد /, "خلال ")}`,
        to: `/exams/${e.public_id}/monitor`,
        tag: "مراقبة",
      })),
    ...mine
      .filter((a) => new Date(a.due_at).getTime() > now && new Date(a.due_at).getTime() < horizon)
      .map((a) => ({
        at: a.due_at,
        now: false,
        key: `a${a.public_id}`,
        title: `ينتهي موعد ${a.title}`,
        meta: a.course_name,
        to: `/assignments/${a.public_id}`,
        tag: dueLabel(a.due_at, now),
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // The queue by course (board DesktopTeacherToday): a stacked bar in each course's colour,
  // and the newest hand-ins with the oldest waiting time.
  const codes = new Map<string, string>(
    (queue.data?.groups ?? []).map((g) => [g.assignment.course_name, g.assignment.course_code]),
  );
  const handIns = (queue.data?.groups ?? []).flatMap((g) =>
    g.submissions.map((sub) => ({ ...sub, assignment: g.assignment })),
  );
  const at = (x: {
    current_version?: { submitted_at?: string } | null;
    first_submitted_at: string;
  }) => x.current_version?.submitted_at ?? x.first_submitted_at;
  const newest = [...handIns].sort((x, y) => at(y).localeCompare(at(x))).slice(0, 4);
  const oldest = [...handIns].sort((x, y) => at(x).localeCompare(at(y)))[0];
  const toAck = (notices.data ?? []).filter(
    (n) => n.requires_ack && !n.acknowledged_at && n.teacher === me.data?.public_id,
  );
  const first = me.data?.full_name_ar ?? "";
  const hour = new Date().getHours();
  return (
    <PortalShell
      title={`${hour < 12 ? "صباح الخير" : "مساء الخير"}، ${first}`}
      subtitle={`${new Date().toLocaleDateString("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long" })} · ${count(students, N.course)}`}
    >
      {toAck.map((n) => (
        <Link
          key={n.public_id}
          to={`/hr-notices/${n.public_id}`}
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-warning-soft px-4 py-3 hover:opacity-95"
        >
          <span className="min-w-0">
            <b className="block text-sm text-text">{n.subject}</b>
            <span className="text-xs text-warning-strong">{n.sent_by} · يتطلب إقرار الاطلاع</span>
          </span>
          <span className="shrink-0 rounded-lg bg-text px-3 py-2 text-xs font-bold text-bg">
            اطّلع وأقرّ
          </span>
        </Link>
      ))}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <section>
          <SectionLabel>جدول اليوم</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {agenda.map((i) => (
              <Link
                key={i.key}
                to={i.to}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="w-14 shrink-0 text-center text-xs text-text-muted">
                  {i.now
                    ? "الآن"
                    : new Date(i.at).toLocaleTimeString("ar-u-nu-latn", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{i.title}</b>
                  <span className="block truncate text-xs text-text-muted">{i.meta}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-warning-strong">{i.tag}</span>
              </Link>
            ))}
            {!agenda.length && (
              <p className="px-4 py-5 text-sm text-text-muted">
                لا شيء مجدول في الأربع والعشرين ساعة القادمة.
              </p>
            )}
          </Card>
          <SectionLabel>إجراءات سريعة</SectionLabel>
          <div className="grid auto-cols-fr grid-flow-col gap-2 text-center text-xs">
            {[
              ...(teaching.some((c) => c.my_role === "teacher" || c.ta_can_notify)
                ? [{ to: "/announcements/new", label: "إعلان", icon: Megaphone }]
                : []),
              { to: "/live/new", label: "جلسة بث", icon: Radio },
              {
                to: teaching[0] ? `/lectures/new?offering=${teaching[0].offering_id}` : "/courses",
                label: "محاضرة",
                icon: BookPlus,
              },
              {
                to: teaching[0]
                  ? `/assignments/new?offering=${teaching[0].offering_id}`
                  : "/courses",
                label: "واجب",
                icon: ClipboardPlus,
              },
            ].map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="rounded-2xl bg-surface p-3 shadow-sm hover:bg-surface-alt"
              >
                <a.icon size={20} className="mx-auto text-primary" aria-hidden />
                <span className="mt-1 block font-semibold">{a.label}</span>
              </Link>
            ))}
          </div>
        </section>
        <aside className="mt-6 lg:mt-0">
          <div className="flex items-end justify-between">
            <SectionLabel>طابور التصحيح</SectionLabel>
            {pending > 0 && (
              <Link to="/grading" className="mb-2 text-sm font-semibold text-primary">
                ابدأ التصحيح
              </Link>
            )}
          </div>
          <Link to="/grading" className="block">
            <Card className="p-4 transition-shadow hover:shadow-md">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-primary">
                  {pending.toLocaleString("ar-u-nu-latn")}
                </span>
                <span className="text-sm text-text-muted">
                  {pending
                    ? `بانتظار تصحيحك${oldest ? ` · أقدمها ${when(at(oldest))}` : ""}`
                    : "لا شيء بانتظار تصحيحك ✓"}
                </span>
              </div>
              {pending > 0 && (
                <>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full" aria-hidden="true">
                    {byCourse.map((c) => (
                      <span
                        key={c.name}
                        className={`${COURSE_TONES[courseTone(codes.get(c.name) ?? c.name)]} [background:currentColor]`}
                        style={{ width: `${(100 * c.n) / pending}%` }}
                      />
                    ))}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                    {[...byCourse]
                      .sort((x, y) => y.n - x.n)
                      .map((c) => (
                        <li key={c.name} className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={`size-2 rounded-full ${COURSE_TONES[courseTone(codes.get(c.name) ?? c.name)]} [background:currentColor]`}
                          />
                          {c.name} {c.n.toLocaleString("ar-u-nu-latn")}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </Card>
          </Link>
          {newest.length > 0 && (
            <>
              <SectionLabel>تسليمات جديدة</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {newest.map((sub) => {
                  const [top, bottom] = splitCourse(sub.assignment.course_code);
                  return (
                    <Link
                      key={sub.public_id}
                      to={`/submissions/${sub.public_id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                    >
                      <CodeTile
                        top={top}
                        bottom={bottom}
                        tone={courseTone(sub.assignment.course_code)}
                      />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm text-text">
                          {sub.student.full_name_ar} — {sub.assignment.title}
                        </b>
                        <span className="text-xs text-text-muted">{when(at(sub))}</span>
                      </span>
                      {sub.grade?.status === "suggested" ? (
                        <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-strong">
                          اقتراح آلي
                        </span>
                      ) : sub.is_late ? (
                        <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger-strong">
                          متأخر
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info-strong">
                          جديد
                        </span>
                      )}
                    </Link>
                  );
                })}
              </Card>
            </>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}
