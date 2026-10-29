import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  ChevronLeft,
  Clock,
  ListTodo,
  Mail,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Panel, QuickLinks } from "../../components/dashboard";
import { Card, Switch } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { actionLabel } from "../department/Audit";
import { useMe } from "../../lib/auth";
import { useCurrentTerm } from "../../lib/department";
import { when, count, N } from "../../lib/format";
import { num } from "../../lib/reports";
import { ALL } from "../../components/Pager";
import { Inbox, type InboxItem, inboxState } from "../homes/Inbox";

const GROUPS: { label: string; roles: string[] }[] = [
  { label: "طلاب", roles: ["student"] },
  { label: "أساتذة ومعيدون", roles: ["teacher", "ta"] },
  { label: "مديرو ومشرفو الأقسام", roles: ["department_manager", "department_supervisor"] },
  { label: "مسجلون وقبول", roles: ["head_registrar", "registrar"] },
  {
    label: "أدوار إدارية أخرى",
    roles: [
      "system_admin",
      "results_officer",
      "academic_affairs",
      "student_affairs",
      "hr",
      "site_manager",
      "events_manager",
    ],
  },
];

/** Mockup «مركز إدارة الكلية» (2026-10-29): the system's state in one line, what needs the
 *  administrator first, settings and users; quick access and recent activity beside. */
export function AdminHome() {
  const me = useMe();
  const client = useQueryClient();
  const health = useQuery({
    queryKey: ["health"],
    // 503 still carries the checks (a degraded service), so no ok() here.
    queryFn: async () => {
      const { data, error } = await api.GET("/api/public/health");
      return data ?? error ?? null;
    },
  });
  // Backups, email and records-vs-accounts (review 2026-09-29 PR 7, «بلاطات صحة»).
  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: async () =>
      (ok(await api.GET("/api/v1/system-status")) as {
        backups: { count: number; latest: string | null };
        email: { backend: string; sends_real_mail: boolean };
        students: { records: number; accounts: number };
      } | null) ?? null,
  });
  const settings = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => ok(await api.GET("/api/v1/system-settings")) ?? null,
  });
  const term = useCurrentTerm();
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/departments", { params: { query: ALL } }))?.results ?? [],
  });
  const programs = useQuery({
    queryKey: ["programs", "all"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/programs", { params: { query: { page_size: 100 } as never } }))
        ?.results ?? [],
  });
  const counts = useQuery({
    queryKey: ["role-counts"],
    queryFn: async () => ok(await api.GET("/api/v1/role-assignments/counts"))?.counts ?? {},
  });
  const byRole = new Map(
    GROUPS.flatMap((g) => g.roles).map((r) => [r, counts.data?.[r] ?? 0] as const),
  );
  const audit = useQuery({
    queryKey: ["audit", "recent"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/audit-logs", { params: { query: { page_size: 6 } } }))?.results ??
      [],
  });
  const toggle = useMutation({
    mutationFn: async (value: boolean) => {
      const { data, error } = await api.PATCH("/api/v1/system-settings", {
        body: { student_registration_requires_approval: value },
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["system-settings"] }),
  });
  const checks: Record<string, string> = {
    database: health.data?.database ?? "",
    cache: health.data?.cache ?? "",
  };
  const healthy = health.data?.status === "ok";
  const total = [...byRole.values()].reduce((a, b) => a + b, 0);
  const latest = status.data?.backups.latest;
  const backupDays = latest
    ? Math.floor((Date.now() - new Date(latest).getTime()) / 86_400_000)
    : null;
  const failing = Object.values(checks).filter((v) => v && v !== "ok").length;
  // «يحتاج إجراءك» (mockups 2026-10-29): what in the system's state waits on the administrator.
  const inbox: InboxItem[] = [
    {
      n: health.data && !healthy ? Math.max(failing, 1) : 0,
      title: "خدمة لا تعمل كما ينبغي",
      meta: `قاعدة البيانات: ${checks.database || "—"} · الذاكرة المؤقتة: ${checks.cache || "—"}`,
      to: "/system/settings",
      tone: "danger",
      action: "التفاصيل",
    },
    {
      n: status.data && (backupDays == null || backupDays >= 8) ? (backupDays ?? 1) : 0,
      title: backupDays == null ? "لا نسخ احتياطية بعد" : "النسخ الاحتياطي متأخر",
      meta: latest ? `آخر نسخة ${when(latest)} — الرقم بالأيام` : "لم تُسجَّل أي نسخة",
      to: "/system/settings",
      tone: "danger",
      action: "الإعدادات",
    },
    {
      n: status.data
        ? Math.max(status.data.students.records - status.data.students.accounts, 0)
        : 0,
      title: "طلاب في السجلات بلا حساب في البوابة",
      meta: "تُنشأ الحسابات من سجلات الطلاب",
      to: "/system/users",
      action: "المستخدمون",
    },
    {
      n: status.data && !status.data.email.sends_real_mail ? 1 : 0,
      title: "البريد في الوضع التجريبي",
      meta: status.data ? `الرسائل لا تصل إلى أصحابها · ${status.data.email.backend}` : undefined,
      to: "/system/settings",
      tone: "info",
      action: "الإعدادات",
    },
  ];
  return (
    <PortalShell
      title="إدارة النظام"
      subtitle={`${me.data?.full_name_ar ?? ""} · مدير النظام${health.data?.version ? ` · الإصدار ${health.data.version}` : ""}`}
    >
      {/* The system's state in one line; what needs attention is in «يحتاج إجراءك» below. */}
      <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <span className="flex items-center gap-2 font-semibold text-text">
          <span
            aria-hidden
            className={`size-2.5 rounded-full ${health.data ? (healthy ? "bg-success" : "bg-danger") : "bg-border"}`}
          />
          {health.data
            ? healthy
              ? "الخدمات تعمل بصورة طبيعية"
              : "خدمة تحتاج نظرة"
            : "جارٍ التحقق من الخدمات"}
        </span>
        <span className="flex items-center gap-1.5 text-text-muted">
          <Clock size={16} aria-hidden />
          آخر نسخة احتياطية: {latest ? when(latest) : "لا نسخ بعد"}
        </span>
        <span className="text-text-muted">
          الطلاب: {num(status.data?.students.accounts ?? 0)} حساب من{" "}
          {num(status.data?.students.records ?? 0)} سجل
        </span>
        <Link
          to="/system/settings"
          className="tap-44 ms-auto inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
        >
          تفاصيل النظام
          <ChevronLeft size={16} aria-hidden className="ltr:rotate-180" />
        </Link>
      </Card>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="space-y-6">
          <Inbox
            title="يحتاج إجراءك"
            icon={ListTodo}
            items={inbox}
            empty="لا شيء ينتظرك: الخدمات والنسخ والبريد على ما يرام."
            {...inboxState(health, status)}
          />
          <Panel
            title="إعدادات النظام"
            icon={Settings2}
            more={{ label: "كل الإعدادات", to: "/system/settings" }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>
                <b className="block">تسجيل الطلاب يتطلب موافقة مدير القسم</b>
                <span className="text-xs text-text-muted">
                  مفعّل: يمرّ كل تسجيل على مدير القسم · معطّل: يسجل الطالب مباشرة
                </span>
              </span>
              <Switch
                checked={!!settings.data?.student_registration_requires_approval}
                onChange={(v) => toggle.mutate(v)}
                disabled={!settings.data || toggle.isPending}
                label="تسجيل الطلاب يتطلب موافقة مدير القسم"
              />
            </div>
            <Link
              to="/system/structure"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-alt"
            >
              <Building2 size={18} className="text-primary" aria-hidden />
              <span className="flex-1">
                <b className="block">الفصل الحالي والهيكل</b>
                <span className="text-xs text-text-muted">
                  {term.data?.name_ar ?? "—"} · {count(departments.data?.length ?? 0, N.department)}{" "}
                  · {count(programs.data?.length ?? 0, N.program)}
                </span>
              </span>
            </Link>
          </Panel>
          <Panel
            title={`المستخدمون · ${num(total)}`}
            icon={Users}
            more={{ label: "إدارة", to: "/system/users" }}
          >
            {GROUPS.map((g) => (
              <Link
                key={g.label}
                to="/system/users"
                className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-alt"
              >
                {g.label}
                <b>{num(g.roles.reduce((n, r) => n + (byRole.get(r) ?? 0), 0))}</b>
              </Link>
            ))}
          </Panel>
        </div>
        <aside className="mt-6 space-y-6 lg:mt-0">
          <Panel title="وصول سريع" icon={Zap}>
            <QuickLinks
              items={[
                { label: "المستخدمون", to: "/system/users", icon: UserPlus },
                { label: "الأدوار والصلاحيات", to: "/system/roles", icon: ShieldCheck },
                { label: "الهيكل الأكاديمي", to: "/system/structure", icon: Building2 },
                { label: "إشعار للجميع", to: "/notifications/new", icon: Mail },
              ]}
            />
          </Panel>
          <Panel
            title="آخر النشاطات"
            icon={Activity}
            more={{ label: "السجل الكامل", to: "/department/audit" }}
          >
            {(audit.data ?? []).map((a) => (
              <div key={a.id} className="px-4 py-2.5 text-sm">
                <b>{a.actor || "النظام"}</b>{" "}
                <span className="text-text-muted">
                  · {actionLabel(a.action)} · {a.target_repr}
                </span>
                <span className="block text-xs text-text-muted">{when(a.at)}</span>
              </div>
            ))}
            {audit.isSuccess && !audit.data.length && (
              <p className="px-4 py-3 text-sm text-text-muted">لا نشاط بعد.</p>
            )}
          </Panel>
        </aside>
      </div>
    </PortalShell>
  );
}
