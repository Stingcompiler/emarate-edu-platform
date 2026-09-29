import { useQuery } from "@tanstack/react-query";
import {
  Award,
  ChevronLeft,
  ClipboardList,
  Download,
  FileText,
  LogOut,
  Megaphone,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe, useSignOut } from "../../lib/auth";
import { initials, num } from "../../lib/reports";
import { count, N } from "../../lib/format";
import { ALL } from "../../components/Pager";

function Row({
  to,
  icon,
  label,
  note,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  note?: ReactNode;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt">
      <span className="text-primary">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-text">{label}</span>
      {note && <span className="text-xs text-text-muted">{note}</span>}
      <ChevronLeft size={16} className="text-text-muted rtl:rotate-0 ltr:rotate-180" aria-hidden />
    </Link>
  );
}

/** Board: StudentMe (phone); desktop derived — two columns. The fifth tab gathers the rest of the student's pages. */
export function Me() {
  const me = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const results = useQuery({
    queryKey: ["me", "results"],
    queryFn: async () => ok(await api.GET("/api/v1/me/results")) ?? null,
  });
  const regulations = useQuery({
    queryKey: ["regulations"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/regulations", { params: { query: ALL } }))?.results ?? [],
  });
  const cases = useQuery({
    queryKey: ["me", "cases"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/me/cases", { params: { query: ALL } }))?.results ?? [],
  });
  const s = me.data?.student;
  const pendingAck = (regulations.data ?? []).filter(
    (r) => r.requires_acknowledgement && r.acknowledged === false,
  ).length;
  const installed =
    typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
  return (
    <PortalShell title="أنا">
      <Card className="flex items-center gap-4 p-4">
        <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary-700">
          {initials(me.data?.full_name_ar ?? "")}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-lg text-text">{me.data?.full_name_ar}</b>
          {s && (
            <span className="text-sm text-text-muted">
              {s.program} · المستوى {num(s.level)}
            </span>
          )}
        </span>
        {s && (
          <span className="text-end text-xs text-text-muted">
            الرقم الجامعي
            <bdi className="block text-base font-bold text-text">{s.university_number}</bdi>
          </span>
        )}
      </Card>
      <div className="mt-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div>
          <SectionLabel>الأكاديمي</SectionLabel>
          <Card className="divide-y divide-border-soft">
            <Row
              to="/results"
              icon={<Award size={18} aria-hidden />}
              label="النتائج"
              note={
                results.data?.cumulative_gpa ? `معدل ${results.data.cumulative_gpa}` : undefined
              }
            />
            <Row
              to="/print/my-results"
              icon={<FileText size={18} aria-hidden />}
              label="كشف النتائج (طباعة / PDF)"
              note={results.data ? `الفصول: ${num(results.data.terms.length)}` : undefined}
            />
            <Row to="/exams" icon={<ClipboardList size={18} aria-hidden />} label="الاختبارات" />
            <Row to="/live" icon={<Radio size={18} aria-hidden />} label="البث المباشر" />
            <Row to="/announcements" icon={<Megaphone size={18} aria-hidden />} label="الإعلانات" />
            <Row
              to="/regulations"
              icon={<ScrollText size={18} aria-hidden />}
              label="اللوائح والضوابط"
              note={
                pendingAck ? (
                  <span className="font-semibold text-warning-strong">إقرار مطلوب</span>
                ) : undefined
              }
            />
            <Row
              to="/me/status"
              icon={<ShieldCheck size={18} aria-hidden />}
              label="حالتي الأكاديمية"
              note={cases.data?.length ? `${count(cases.data.length, N.case)}` : "لا حالات"}
            />
          </Card>
        </div>
        <div className="mt-6 lg:mt-0">
          <SectionLabel>التطبيق</SectionLabel>
          <Card className="divide-y divide-border-soft">
            <Row
              to="/settings"
              icon={<Settings size={18} aria-hidden />}
              label="الإشعارات والإعدادات"
            />
            {!installed && (
              <Row
                to="/install"
                icon={<Download size={18} aria-hidden />}
                label="ثبّت التطبيق على هاتفك"
                note="للإشعارات والعمل دون اتصال"
              />
            )}
          </Card>
          <Button
            variant="secondary"
            className="mt-4 w-full text-danger-strong"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            <LogOut size={16} aria-hidden /> تسجيل الخروج
          </Button>
        </div>
      </div>
    </PortalShell>
  );
}

/** Board: StudentStatus — the record as the college keeps it, plus cases published to the student. */
export function MyStatus() {
  const me = useMe();
  const results = useQuery({
    queryKey: ["me", "results"],
    queryFn: async () => ok(await api.GET("/api/v1/me/results")) ?? null,
  });
  const courses = useQuery({
    queryKey: ["me", "courses"],
    queryFn: async () => ok(await api.GET("/api/v1/me/courses")) ?? [],
  });
  const cases = useQuery({
    queryKey: ["me", "cases"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/me/cases", { params: { query: ALL } }))?.results ?? [],
  });
  const s = me.data?.student;
  const hours = (courses.data ?? []).reduce((n, c) => n + c.credit_hours, 0);
  return (
    <PortalShell
      title="حالتي الأكاديمية"
      subtitle="كما يظهر في سجل الكلية · يديره مسؤول المسجلين وشؤون الطلاب"
      back={{ label: "أنا", to: "/me" }}
    >
      <Card className="bg-success-soft p-4 text-success-strong">
        <b className="text-lg">{s?.status_label ?? "منتظم"}</b>
        <p className="text-sm">
          {courses.data?.[0]?.term ?? ""} · المستوى {num(s?.level ?? 0)} · الساعات المسجلة{" "}
          {num(hours)}
        </p>
      </Card>
      <SectionLabel>التسجيل</SectionLabel>
      <Card className="divide-y divide-border-soft text-sm">
        {[
          ["البرنامج", s?.program ?? "—"],
          ["الرقم الجامعي", <bdi key="n">{s?.university_number}</bdi>],
          [
            "المعدل التراكمي",
            results.data?.cumulative_gpa ? <bdi key="g">{results.data.cumulative_gpa}</bdi> : "—",
          ],
        ].map(([k, v]) => (
          <p key={String(k)} className="flex justify-between gap-3 px-4 py-2.5">
            <span className="text-text-muted">{k}</span>
            <b>{v}</b>
          </p>
        ))}
      </Card>
      <SectionLabel>الحالات المنشورة لي</SectionLabel>
      <div className="space-y-3">
        {(cases.data ?? []).map((c) => (
          <Card key={c.public_id} className="p-4 text-sm">
            <div className="flex items-center justify-between">
              <b>{c.title}</b>
              <span className="text-xs text-text-muted">
                {c.status === "closed" ? "مغلق" : c.status === "decided" ? "صدر قرار" : "مفتوح"}
              </span>
            </div>
            {c.decision && <p className="mt-1 text-text">{c.decision}</p>}
            {c.sanction && <p className="mt-1 text-xs text-text-muted">القرار: {c.sanction}</p>}
          </Card>
        ))}
        {!cases.data?.length && (
          <Card className="p-4 text-sm text-text-muted">لا حالات منشورة لك.</Card>
        )}
      </div>
      <p className="mt-3 text-xs text-text-muted">
        لا تُعرض هنا إلا الحالات التي قرر أمين شؤون الطلاب نشرها لك. لأي اعتراض راجع مكتب شؤون
        الطلاب خلال 14 يومًا من النشر.
      </p>
    </PortalShell>
  );
}
