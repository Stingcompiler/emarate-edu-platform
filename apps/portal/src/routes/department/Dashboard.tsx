import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { DepartmentSwitch } from "../../components/DepartmentSwitch";
import { PortalShell } from "../../components/PortalShell";
import { Avatar, Card, CodeTile, SectionLabel, Summary, splitCode } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { days, initials, num } from "../../lib/reports";
import { ALL } from "../../components/Pager";
import { count, N, fileName } from "../../lib/format";
import { Inbox, inboxState, type InboxItem } from "../homes/Inbox";

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
      action: "اعتماد",
    },
    batches.data?.length && {
      n: batches.data.length,
      title: "دفعات نتائج جاهزة للاعتماد",
      meta: batches.data
        .map((b) => fileName(b.file_name))
        .slice(0, 2)
        .join(" · "),
      to: "/result-imports",
      action: "مراجعة",
    },
    noTeacher.length && {
      n: noTeacher.length,
      title: "مواد بلا أستاذ معيّن",
      meta: noTeacher
        .map((o) => o.course_detail.code)
        .slice(0, 4)
        .join(" · "),
      to: "/department/courses?filter=teacher",
      tone: "danger",
      action: "تعيين أساتذة",
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
        action: "عرض الأساتذة",
      },
  ].filter(Boolean) as InboxItem[];
  // The department's pages, kept (docs/02 D20) as one quiet list of links.
  const sections = [
    { to: "/department/courses", label: "المواد", note: `${num(list.length)}` },
    {
      to: "/department/lectures",
      label: "المحاضرات",
      note: k ? `+${num(k.lectures_30d)} في 30 يومًا` : "",
    },
    {
      to: "/department/teachers",
      label: "الأساتذة",
      note: `${num(teachers.data?.summary.members ?? 0)}`,
    },
    { to: "/department/students", label: "طلاب القسم", note: `${num(k?.students ?? 0)}` },
    { to: "/reports", label: "التقارير", note: "" },
    { to: "/result-imports", label: "النتائج", note: "رفع ملف" },
    { to: "/department/audit", label: "سجل العمليات", note: "" },
    { to: "/courses", label: "موادي", note: "" },
    {
      to: "/department/approvals",
      label: "طلبات التسجيل",
      note: pendingCount ? num(pendingCount) : "",
    },
    { to: "/exams", label: "الاختبارات", note: "" },
    { to: "/live", label: "جلسات البث", note: "" },
    { to: "/announcements", label: "الإعلانات", note: "" },
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
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="order-1 lg:col-start-1 lg:row-start-1">
          <SectionLabel>يحتاج قرارك · {num(inbox.length)}</SectionLabel>
          <Inbox
            {...inboxState(term, offerings, report, teachers, approvals, batches)}
            items={inbox}
          />
        </section>
        <aside className="order-2 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Summary
            title="القسم بالأرقام"
            rows={[
              {
                label: "طلاب منتظمون",
                value: num(k?.students ?? 0),
                note: k ? `${num(k.enrolled_percent ?? 0)}٪ مسجلون في مواد` : "",
              },
              {
                label: "مواد مفتوحة",
                value: num(list.length),
                note: noTeacher.length ? `${num(noTeacher.length)} بلا أستاذ` : "كلها بأساتذة",
                tone: noTeacher.length ? "bad" : "good",
              },
              {
                label: "الأساتذة والمعيدون",
                value: num(teachers.data?.summary.members ?? 0),
                note: slow.length ? `${num(slow.length)} تحت الحد` : "ضمن الحدود",
                tone: slow.length ? "bad" : "good",
              },
              {
                label: "متوسط التصحيح",
                value: days(k?.grading_days),
                note: `الحد ${num(report.data?.thresholds.grading_days ?? 3)}`,
              },
            ]}
          />
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
                    <Avatar text={initials(t.name)} tone="danger" />
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
        <div className="order-3 space-y-4 lg:col-start-1 lg:row-start-2">
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
          <SectionLabel>صفحات القسم</SectionLabel>
          <Card className="grid grid-cols-2 divide-border-soft sm:grid-cols-3 xl:grid-cols-4">
            {sections.map((s) => (
              <Link
                key={s.to + s.label}
                to={s.to}
                className="flex items-baseline justify-between gap-2 border-b border-border-soft px-4 py-2.5 text-sm hover:bg-surface-alt"
              >
                <span className="font-semibold text-text">{s.label}</span>
                {s.note && <span className="text-xs text-text-muted">{s.note}</span>}
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}
