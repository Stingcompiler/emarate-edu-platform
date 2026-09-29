import { useQuery } from "@tanstack/react-query";
import { BookPlus, ClipboardPlus, Megaphone, Radio } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { dueLabel, useAssignments, useMyCourses } from "../../lib/learning";
import { useGradingQueue } from "./Grading";
import { count, N } from "../../lib/format";
import { ALL } from "../../components/Pager";

const DAY = 86_400_000;

/** Board: TeacherToday (phone); desktop derived — agenda beside actions and notices. */
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
      (await api.GET("/api/v1/live-sessions", { params: { query: ALL } })).data?.results ?? [],
  });
  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: async () =>
      (await api.GET("/api/v1/exams", { params: { query: ALL } })).data?.results ?? [],
  });
  const notices = useQuery({
    queryKey: ["hr-notices", "mine"],
    queryFn: async () =>
      (await api.GET("/api/v1/hr-notices", { params: { query: ALL } })).data?.results ?? [],
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
  const toAck = (notices.data ?? []).filter(
    (n) => n.requires_ack && !n.acknowledged_at && n.teacher === me.data?.public_id,
  );
  const first = me.data?.full_name_ar ?? "";
  const hour = new Date().getHours();
  return (
    <PortalShell
      title={`${hour < 12 ? "صباح الخير" : "مساء الخير"}، ${first}`}
      subtitle={`${new Date().toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" })} · ${count(students, N.course)}`}
    >
      <Link to="/grading" className="block">
        <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
          <span className="text-4xl font-bold text-primary">{pending.toLocaleString("ar")}</span>
          <span className="min-w-0 flex-1">
            <b className="block text-text">تسليمًا بانتظار تصحيحك</b>
            <span className="text-xs text-text-muted">
              {byCourse.map((c) => `${c.n.toLocaleString("ar")} في ${c.name}`).join(" · ") ||
                "لا شيء متأخر"}
            </span>
          </span>
          <span className="text-sm font-semibold text-primary">ابدأ</span>
        </Card>
      </Link>
      <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
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
                    : new Date(i.at).toLocaleTimeString("ar", {
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
        </section>
        <aside className="mt-6 space-y-4 lg:mt-0">
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
          {toAck.length > 0 && (
            <>
              <SectionLabel>يتطلب إقرارك</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {toAck.map((n) => (
                  <Link
                    key={n.public_id}
                    to={`/hr-notices/${n.public_id}`}
                    className="block px-4 py-3 hover:bg-surface-alt"
                  >
                    <b className="block text-sm text-text">{n.subject}</b>
                    <span className="text-xs text-text-muted">
                      {n.sent_by} · يتطلب إقرار الاطلاع
                    </span>
                  </Link>
                ))}
              </Card>
            </>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}
