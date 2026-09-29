import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardCheck,
  FileUp,
  History,
  Library,
  Megaphone,
  Radio,
  UserCheck,
  Users,
} from "lucide-react";
import { Link } from "react-router";

import { DepartmentSwitch } from "../../components/DepartmentSwitch";
import { PortalShell } from "../../components/PortalShell";
import { Card, CodeTile, SectionLabel, splitCode } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { days, initials, num } from "../../lib/reports";
import { ALL } from "../../components/Pager";
import { count, N } from "../../lib/format";

/** Boards: DesktopDeptDashboard (desktop), AdminHome (phone). The section list is fixed (docs/02 §4.15). */
export function DepartmentDashboard() {
  const me = useMe();
  const { id, department } = useDepartment();
  const term = useCurrentTerm();
  const offerings = useOfferings(id, term.data?.id);
  const report = useQuery({
    queryKey: ["reports", "department", "dash", id],
    enabled: !!id,
    queryFn: async () =>
      ok(await api.GET("/api/v1/reports/department", { params: { query: { department: id } } })) ??
      null,
  });
  const teachers = useQuery({
    queryKey: ["reports", "teachers", "dash", id],
    enabled: !!id,
    queryFn: async () =>
      ok(await api.GET("/api/v1/reports/teachers", { params: { query: { department: id } } })) ??
      null,
  });
  const approvals = useQuery({
    queryKey: ["registration-requests", "pending"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/registration-requests", {
          params: { query: { ...ALL, status: "pending_approval" } },
        }),
      ) ?? null,
  });
  const batches = useQuery({
    queryKey: ["result-imports", "validated", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/result-imports", {
          params: { query: { ...ALL, status: "validated" } as never },
        }),
      )?.results ?? [],
  });
  const k = report.data?.kpis;
  const list = offerings.data ?? [];
  const noTeacher = list.filter((o) => !o.instructors.some((i) => i.role === "teacher"));
  const slow = (teachers.data?.rows ?? []).filter((t) => t.status === "below");
  const pendingCount = approvals.data?.count ?? 0;
  const inbox = [
    pendingCount && {
      n: pendingCount,
      title: "طلبات تسجيل بانتظار الاعتماد",
      meta: "الاعتماد يفعّل الحساب ويُشعر الطالب",
      to: "/department/approvals",
    },
    batches.data?.length && {
      n: batches.data.length,
      title: "دفعات نتائج جاهزة للاعتماد",
      meta: batches.data
        .map((b) => b.file_name)
        .slice(0, 2)
        .join(" · "),
      to: "/result-imports",
    },
    noTeacher.length && {
      n: noTeacher.length,
      title: "مواد بلا أستاذ معيّن",
      meta: noTeacher
        .map((o) => o.course_detail.code)
        .slice(0, 4)
        .join(" · "),
      to: "/department/courses",
    },
    k?.grading_days != null &&
      slow.length && {
        n: slow.length,
        title: "أساتذة تحت حد التصحيح أو الرفع",
        meta: slow
          .map((t) => t.name)
          .slice(0, 2)
          .join(" · "),
        to: "/department/teachers",
      },
  ].filter(Boolean) as { n: number; title: string; meta: string; to: string }[];
  const sections = [
    { to: "/department/courses", label: "المواد", icon: BookOpen, note: `${num(list.length)}` },
    {
      to: "/department/lectures",
      label: "المحاضرات",
      icon: Library,
      note: k ? `+${num(k.lectures_30d)} في 30 يومًا` : "",
    },
    {
      to: "/department/teachers",
      label: "الأساتذة",
      icon: UserCheck,
      note: `${num(teachers.data?.summary.members ?? 0)}`,
    },
    {
      to: "/department/students",
      label: "طلاب القسم",
      icon: Users,
      note: `${num(k?.students ?? 0)}`,
    },
    { to: "/reports", label: "التقارير", icon: ClipboardCheck, note: "" },
    { to: "/result-imports", label: "النتائج", icon: FileUp, note: "رفع ملف" },
    { to: "/department/audit", label: "سجل العمليات", icon: History, note: "" },
    { to: "/courses", label: "موادي", icon: BookOpen, note: "" },
    {
      to: "/department/approvals",
      label: "طلبات التسجيل",
      icon: UserCheck,
      note: pendingCount ? num(pendingCount) : "",
    },
    { to: "/exams", label: "الاختبارات", icon: ClipboardCheck, note: "" },
    { to: "/live", label: "جلسات البث", icon: Radio, note: "" },
    { to: "/announcements", label: "الإعلانات", icon: Megaphone, note: "" },
  ];
  return (
    <PortalShell
      title={department ? `قسم ${department.name_ar}` : "لوحة القسم"}
      subtitle={
        term.data
          ? `${me.data?.roles.some((r) => r.role === "department_supervisor") ? "مشرف القسم" : "مدير القسم"} · ${term.data.name_ar}`
          : undefined
      }
    >
      <DepartmentSwitch />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          [
            num(k?.students ?? 0),
            "طلاب منتظمون",
            k ? `${num(k.enrolled_percent ?? 0)}٪ مسجلون في مواد` : "",
          ],
          [
            num(list.length),
            "مادة مفتوحة",
            noTeacher.length ? `${num(noTeacher.length)} بلا أستاذ` : "كلها بأساتذة",
          ],
          [
            num(teachers.data?.summary.members ?? 0),
            "الأساتذة والمعيدون",
            slow.length ? `${num(slow.length)} تحت الحد` : "ضمن الحدود",
          ],
          [
            days(k?.grading_days),
            "متوسط التصحيح",
            `الحد ${num(report.data?.thresholds.grading_days ?? 3)}`,
          ],
        ].map(([v, l, n]) => (
          <Card key={l} className="px-4 py-3">
            <p className="text-2xl font-bold text-text">{v}</p>
            <p className="text-xs text-text-muted">{l}</p>
            <p className="mt-1 text-[11px] text-text-muted">{n}</p>
          </Card>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4">
          <SectionLabel>المواد والتعيينات · {num(list.length)}</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {list.slice(0, 8).map((o) => {
              const teacher = o.instructors.find((i) => i.role === "teacher");
              const ta = o.instructors.find((i) => i.role === "ta");
              const [top, bottom] = splitCode(o.course_detail.code);
              return (
                <Link
                  key={o.id}
                  to="/department/courses"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <CodeTile top={top} bottom={bottom} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-text">{o.course_detail.name_ar}</b>
                    <span className="text-xs text-text-muted">
                      {teacher ? (
                        teacher.user.full_name_ar
                      ) : (
                        <span className="font-semibold text-danger-strong">بلا أستاذ</span>
                      )}
                      {ta ? ` · معيد: ${ta.user.full_name_ar}` : ""} ·{" "}
                      {count(o.enrolled_count, N.student)}
                    </span>
                  </span>
                </Link>
              );
            })}
            <Link
              to="/department/courses"
              className="block px-4 py-2.5 text-center text-sm font-semibold text-primary"
            >
              كل المواد
            </Link>
          </Card>
          <SectionLabel>اللوحة</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {sections.map((s) => (
              <Link
                key={s.to + s.label}
                to={s.to}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm hover:bg-surface-alt"
              >
                <s.icon size={18} className="text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{s.label}</span>
                  {s.note && <span className="block text-xs text-text-muted">{s.note}</span>}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <aside className="order-first space-y-4 lg:order-none">
          <SectionLabel>صندوق القرارات · {num(inbox.length)}</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {inbox.map((i) => (
              <Link
                key={i.title}
                to={i.to}
                className="flex items-start gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning-soft text-sm font-bold text-warning-strong">
                  {num(i.n)}
                </span>
                <span className="min-w-0">
                  <b className="block text-sm text-text">{i.title}</b>
                  <span className="block truncate text-xs text-text-muted">{i.meta}</span>
                </span>
              </Link>
            ))}
            {!inbox.length && <p className="px-4 py-4 text-sm text-text-muted">لا شيء بانتظارك.</p>}
          </Card>
          {slow.length > 0 && (
            <>
              <SectionLabel>يحتاج انتباهك</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {slow.slice(0, 4).map((t) => (
                  <Link
                    key={t.public_id}
                    to={`/hr/teachers/${t.public_id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-danger-soft text-xs font-semibold text-danger-strong">
                      {initials(t.name)}
                    </span>
                    <span className="min-w-0">
                      <b className="block text-sm text-text">{t.name}</b>
                      <span className="text-xs text-text-muted">
                        تصحيح {days(t.grading_days)} · غير المصحح {num(t.ungraded)}
                      </span>
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
