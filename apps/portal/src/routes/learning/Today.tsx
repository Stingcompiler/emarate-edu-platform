import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { LiveBanner } from "../../components/LiveBanner";
import { PortalShell } from "../../components/PortalShell";
import { Card, CodeTile, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when, count, N, score } from "../../lib/format";
import { num } from "../../lib/reports";
import {
  courseTone,
  dueLabel,
  splitCourse,
  taskState,
  useAssignments,
  useLectures,
} from "../../lib/learning";
import { examPhase } from "../exams/Exams";
import { ALL } from "../../components/Pager";

const DAY = 86_400_000;

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

/** Boards: StudentToday (phone), DesktopStudentToday — a banner for what needs a signature,
 *  then two balanced columns: what is due (today, tomorrow, this week) beside what is new. */
export function Today() {
  const me = useMe();
  const assignments = useAssignments();
  const lectures = useLectures("all");
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
  const regulations = useQuery({
    queryKey: ["regulations"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/regulations", { params: { query: ALL } }))?.results ?? [],
  });
  const now = Date.now();
  const first = me.data?.full_name_ar?.split(" ")[0] ?? "";
  const sessions = (live.data ?? []).filter((s) => s.status !== "cancelled");
  const liveNow = sessions.find(
    (s) => new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now,
  );
  const horizon = now + 2 * DAY;
  const agenda = [
    ...sessions
      .filter(
        (s) => new Date(s.ends_at).getTime() > now && new Date(s.starts_at).getTime() < horizon,
      )
      .map((s) => ({
        at: s.starts_at,
        key: `l-${s.public_id}`,
        title: `بث: ${s.course_name || s.title}`,
        meta: `${s.title} · ${s.host_name}`,
        to: "/live",
        tag: new Date(s.starts_at).getTime() <= now ? "جارٍ" : "",
      })),
    ...(assignments.data ?? [])
      .filter(
        (a) =>
          ["today", "late"].includes(taskState(a, now)) ||
          (!a.mine && new Date(a.due_at).getTime() < horizon && new Date(a.due_at).getTime() > now),
      )
      .map((a) => ({
        at: a.due_at,
        key: `a-${a.public_id}`,
        title: `تسليم: ${a.title}`,
        meta: `${a.course_name} · ${count(Number(a.max_grade), N.mark)}`,
        to: `/assignments/${a.public_id}`,
        tag: dueLabel(a.due_at, now),
      })),
    ...(exams.data ?? [])
      .filter(
        (e) =>
          e.status === "published" &&
          examPhase(e, now).key !== "closed" &&
          new Date(e.opens_at).getTime() < horizon,
      )
      .map((e) => ({
        at: e.opens_at,
        key: `e-${e.public_id}`,
        title: e.title,
        meta: `${e.course_name} · ${count(e.duration_minutes, N.minute)} · ${count(e.questions_count, N.question)}`,
        to: `/exams/${e.public_id}`,
        tag: new Date(e.opens_at).getTime() <= now ? "مفتوح" : dueLabel(e.opens_at, now),
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // Later this week (after tomorrow, within 7 days): what to plan for (board DesktopStudentToday).
  const weekEnd = now + 7 * DAY;
  const later = [
    ...(assignments.data ?? [])
      .filter((a) => {
        const due = new Date(a.due_at).getTime();
        return !a.mine && due >= horizon && due < weekEnd;
      })
      .map((a) => ({
        at: a.due_at,
        key: `a-${a.public_id}`,
        code: a.course_code,
        title: a.title,
        meta: `${a.course_name} · تسليم`,
        to: `/assignments/${a.public_id}`,
      })),
    ...(exams.data ?? [])
      .filter((e) => {
        const opens = new Date(e.opens_at).getTime();
        return e.status === "published" && opens >= horizon && opens < weekEnd;
      })
      .map((e) => ({
        at: e.opens_at,
        key: `e-${e.public_id}`,
        code: e.course_code,
        title: e.title,
        meta: `${e.course_name} · ${count(e.duration_minutes, N.minute)}`,
        to: `/exams/${e.public_id}`,
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // The week's workload: assignments due in the seven days around today, done or not.
  const week = (assignments.data ?? []).filter((a) => {
    const due = new Date(a.due_at).getTime();
    return due > now - 7 * DAY && due < weekEnd;
  });
  const done = week.filter((a) => a.mine).length;
  const late = week.filter((a) => taskState(a, now) === "late").length;
  const pendingAck = (regulations.data ?? []).filter(
    (r) => r.requires_acknowledgement && r.acknowledged === false,
  );
  const fresh = (lectures.data ?? [])
    .filter(
      (l) => l.is_published && l.published_at && now - new Date(l.published_at).getTime() < 7 * DAY,
    )
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, 4);
  const graded = (assignments.data ?? []).filter((a) => a.mine?.graded).slice(0, 3);
  const dateLine = new Date().toLocaleDateString("ar-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <PortalShell title={`${greeting()}، ${first}`} subtitle={dateLine}>
      {liveNow && (
        <div className="mb-4">
          <LiveBanner
            title={`${liveNow.course_name} — ${liveNow.title}`}
            meta={`${liveNow.host_name} · بدأ ${when(liveNow.starts_at)}`}
          />
        </div>
      )}
      {pendingAck.map((r) => (
        <Link
          key={r.public_id}
          to={`/regulations/${r.public_id}`}
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-warning-soft px-4 py-3 hover:opacity-95"
        >
          <span className="min-w-0">
            <b className="block text-sm text-text">{r.title} تنتظر إقرارك</b>
            <span className="text-xs text-warning-strong">إقرار مطلوب قبل ما يشترطه من أعمال</span>
          </span>
          <span className="shrink-0 rounded-lg bg-text px-3 py-2 text-xs font-bold text-bg">
            اقرأ وأقرّ
          </span>
        </Link>
      ))}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <section>
          <div className="flex items-end justify-between">
            <SectionLabel>مستحق اليوم والغد</SectionLabel>
            <Link to="/tasks" className="mb-2 text-sm font-semibold text-primary">
              كل المهام
            </Link>
          </div>
          <Card className="divide-y divide-border-soft">
            {agenda.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="w-14 shrink-0 text-center text-xs text-text-muted">
                  {new Date(item.at).toLocaleTimeString("ar-u-nu-latn", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text">{item.title}</span>
                  <span className="block truncate text-xs text-text-muted">{item.meta}</span>
                </span>
                {item.tag && (
                  <span className="shrink-0 text-xs font-semibold text-warning-strong">
                    {item.tag}
                  </span>
                )}
              </Link>
            ))}
            {!agenda.length && (
              <p className="px-4 py-5 text-sm text-text-muted">لا شيء مجدول اليوم وغدًا.</p>
            )}
          </Card>
          {later.length > 0 && (
            <>
              <SectionLabel>هذا الأسبوع</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {later.map((item) => {
                  const [top, bottom] = splitCourse(item.code ?? "");
                  return (
                    <Link
                      key={item.key}
                      to={item.to}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                    >
                      <span className="w-16 shrink-0 text-center text-xs leading-tight text-text-muted">
                        <b className="block text-sm text-text">
                          {new Date(item.at).toLocaleDateString("ar-u-nu-latn", {
                            day: "numeric",
                            month: "short",
                          })}
                        </b>
                        {new Date(item.at).toLocaleDateString("ar-u-nu-latn", { weekday: "long" })}
                      </span>
                      {item.code ? (
                        <CodeTile top={top} bottom={bottom} tone={courseTone(item.code)} />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-text">{item.title}</span>
                        <span className="block truncate text-xs text-text-muted">{item.meta}</span>
                      </span>
                    </Link>
                  );
                })}
              </Card>
            </>
          )}
        </section>
        <aside className="mt-6 lg:mt-0">
          <SectionLabel>جديد في موادك</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {fresh.map((l) => {
              const code =
                (assignments.data ?? []).find((a) => a.offering === l.offering)?.course_code ?? "";
              const [top, bottom] = splitCourse(code);
              return (
                <Link
                  key={l.public_id}
                  to={`/lectures/${l.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  {code ? <CodeTile top={top} bottom={bottom} tone={courseTone(code)} /> : null}
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-text">{l.title_ar}</b>
                    <span className="text-xs text-text-muted">رُفعت {when(l.published_at!)}</span>
                  </span>
                </Link>
              );
            })}
            {graded.map((a) => (
              <Link
                key={a.public_id}
                to={`/assignments/${a.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">تم تصحيح {a.title}</b>
                  <span className="text-xs text-text-muted">{a.course_name}</span>
                </span>
                <b className="text-sm text-success-strong">
                  {score(a.mine!.score, a.max_grade ?? 0)}
                </b>
              </Link>
            ))}
            {!fresh.length && !graded.length && (
              <p className="px-4 py-4 text-sm text-text-muted">لا جديد هذا الأسبوع.</p>
            )}
          </Card>
          {week.length > 0 && (
            <>
              <SectionLabel>حجم العمل هذا الأسبوع</SectionLabel>
              <Card className="px-4 py-3">
                <p className="text-xs text-text-muted">
                  {count(week.length, N.task)} · أُنجز {num(done)}
                  {late > 0 && <span className="text-danger-strong"> · متأخر {num(late)}</span>}
                </p>
                {/* One segment per task, filled when handed in. */}
                <div className="mt-2 flex gap-1" aria-hidden="true">
                  {week.map((a) => (
                    <span
                      key={a.public_id}
                      className={`h-2 flex-1 rounded-full ${a.mine ? "bg-primary" : taskState(a, now) === "late" ? "bg-danger" : "bg-surface-alt"}`}
                    />
                  ))}
                </div>
              </Card>
            </>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}
