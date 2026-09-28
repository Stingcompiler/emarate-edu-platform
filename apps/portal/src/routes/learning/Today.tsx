import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, CodeTile, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when, count, N } from "../../lib/format";
import { dueLabel, splitCourse, taskState, useAssignments, useLectures } from "../../lib/learning";
import { examPhase } from "../exams/Exams";

const DAY = 86_400_000;

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

/** Board: StudentToday (phone); desktop derived — agenda beside "attention" and "new". */
export function Today() {
  const me = useMe();
  const assignments = useAssignments();
  const lectures = useLectures();
  const live = useQuery({
    queryKey: ["live"],
    queryFn: async () => (await api.GET("/api/v1/live-sessions")).data?.results ?? [],
  });
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: async () => (await api.GET("/api/v1/exams")).data?.results ?? [],
  });
  const regulations = useQuery({
    queryKey: ["regulations"],
    queryFn: async () => (await api.GET("/api/v1/regulations")).data?.results ?? [],
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
  const dateLine = new Date().toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <PortalShell title={`${greeting()}، ${first}`} subtitle={dateLine}>
      {liveNow && (
        <Link
          to="/live"
          className="mb-4 flex items-center gap-3 rounded-2xl bg-danger p-4 text-white shadow-sm"
        >
          <Radio size={22} aria-hidden />
          <span className="min-w-0 flex-1">
            <b className="block text-xs opacity-90">بث مباشر الآن</b>
            <span className="block truncate font-semibold">
              {liveNow.course_name} — {liveNow.title}
            </span>
            <span className="text-xs opacity-90">
              {liveNow.host_name} · بدأ {when(liveNow.starts_at)}
            </span>
          </span>
          <span className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold">انضمام</span>
        </Link>
      )}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <section>
          <div className="flex items-end justify-between">
            <SectionLabel>جدول اليوم والغد</SectionLabel>
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
                  {new Date(item.at).toLocaleTimeString("ar", {
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
        </section>
        <aside className="mt-6 space-y-4 lg:mt-0">
          {pendingAck.length > 0 && (
            <>
              <SectionLabel>يتطلب انتباهك</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {pendingAck.map((r) => (
                  <Link
                    key={r.public_id}
                    to={`/regulations/${r.public_id}`}
                    className="block px-4 py-3 hover:bg-surface-alt"
                  >
                    <span className="text-xs font-semibold text-warning-strong">إقرار مطلوب</span>
                    <b className="block text-sm text-text">{r.title}</b>
                  </Link>
                ))}
              </Card>
            </>
          )}
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
                  {code ? <CodeTile top={top} bottom={bottom} /> : null}
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
                  {Number(a.mine!.score).toLocaleString("ar")}/
                  {Number(a.max_grade).toLocaleString("ar")}
                </b>
              </Link>
            ))}
            {!fresh.length && !graded.length && (
              <p className="px-4 py-4 text-sm text-text-muted">لا جديد هذا الأسبوع.</p>
            )}
          </Card>
        </aside>
      </div>
    </PortalShell>
  );
}
