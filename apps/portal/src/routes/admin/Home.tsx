import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Building2, Mail, Settings2, Users } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel, Switch } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { actionLabel } from "../department/Audit";
import { useMe } from "../../lib/auth";
import { useCurrentTerm } from "../../lib/department";
import { when, count, N } from "../../lib/format";
import { num } from "../../lib/reports";
import { ALL } from "../../components/Pager";

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

/** Board: SystemAdminHome (phone); desktop derived — health and settings beside users and audit. */
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
  return (
    <PortalShell
      title="إدارة النظام"
      subtitle={`${me.data?.full_name_ar ?? ""} · مدير النظام${health.data?.version ? ` · الإصدار ${health.data.version}` : ""}`}
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          ["الخدمة", healthy ? "سليمة" : "تحقق", healthy],
          [
            "قاعدة البيانات",
            checks.database === "ok" ? "متصلة" : (checks.database ?? "—"),
            checks.database === "ok",
          ],
          [
            "الذاكرة المؤقتة",
            checks.cache === "ok" ? "تعمل" : (checks.cache ?? "—"),
            checks.cache === "ok",
          ],
        ].map(([l, v, good]) => (
          <Card key={String(l)} className="p-3 text-center">
            <p
              className={`text-sm font-bold ${good ? "text-success-strong" : "text-warning-strong"}`}
            >
              {String(v)}
            </p>
            <p className="text-[11px] text-text-muted">{String(l)}</p>
          </Card>
        ))}
      </div>
      <div className="mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="space-y-4">
          <SectionLabel>إعدادات النظام</SectionLabel>
          <Card className="divide-y divide-border-soft text-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-2">
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
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
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
            <Link
              to="/system/settings"
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
            >
              <Settings2 size={18} className="text-primary" aria-hidden />
              <span className="flex-1">
                <b className="block">كل الإعدادات</b>
                <span className="text-xs text-text-muted">
                  التسجيل والقبول، التحقق، حدود الأداء
                </span>
              </span>
            </Link>
            <Link
              to="/notifications/new"
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
            >
              <Mail size={18} className="text-primary" aria-hidden />
              <span className="flex-1">
                <b className="block">إشعار للجميع</b>
              </span>
            </Link>
          </Card>
        </div>
        <div className="mt-6 space-y-4 lg:mt-0">
          <div className="flex items-end justify-between">
            <SectionLabel>المستخدمون · {num(total)}</SectionLabel>
            <Link to="/system/users" className="mb-2 text-sm font-semibold text-primary">
              إدارة
            </Link>
          </div>
          <Card className="divide-y divide-border-soft text-sm">
            {GROUPS.map((g) => (
              <Link
                key={g.label}
                to="/system/users"
                className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-alt"
              >
                <span className="flex items-center gap-2">
                  <Users size={16} className="text-text-muted" aria-hidden />
                  {g.label}
                </span>
                <b>{num(g.roles.reduce((n, r) => n + (byRole.get(r) ?? 0), 0))}</b>
              </Link>
            ))}
          </Card>
          <SectionLabel>سجل التدقيق</SectionLabel>
          <Card className="divide-y divide-border-soft text-sm">
            {(audit.data ?? []).map((a) => (
              <div key={a.id} className="px-4 py-2.5">
                <b>{a.actor || "النظام"}</b>{" "}
                <span className="text-text-muted">
                  · {actionLabel(a.action)} · {a.target_repr}
                </span>
                <span className="block text-xs text-text-muted">{when(a.at)}</span>
              </div>
            ))}
            <Link
              to="/department/audit"
              className="flex items-center justify-center gap-2 px-4 py-2.5 font-semibold text-primary"
            >
              <Activity size={16} aria-hidden /> السجل الكامل
            </Link>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}
