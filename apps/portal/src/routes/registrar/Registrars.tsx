import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { PortalShell } from "../../components/PortalShell";
import { Card, Notice, SectionLabel, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { initials, num, useDepartments } from "../../lib/reports";
import { count, N } from "../../lib/format";

/** Board: HeadRegistrarRegistrars — link registrars to departments (what they see and are routed). */
export function Registrars() {
  const client = useQueryClient();
  const departments = useDepartments();
  const users = useQuery({
    queryKey: ["users", "registrars"],
    queryFn: async () =>
      // Registrars only, filtered by the server (not the first 100 accounts of every role).
      ok(
        await api.GET("/api/v1/users", {
          params: { query: { is_active: true, role: "registrar", page_size: 100 } },
        }),
      )?.results ?? [],
  });
  const load = useQuery({
    queryKey: ["applications", "load"],
    // Each registrar's load, counted by the server (review 2026-09-29, P3).
    queryFn: async () =>
      ((
        ok(await api.GET("/api/v1/applications/summary")) as {
          by_registrar?: Record<string, number>;
        }
      )?.by_registrar ?? {}) as Record<string, number>,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["users"] });
  const link = useMutation({
    mutationFn: async ({ user, department }: { user: string; department: number }) => {
      const { data, error } = await api.POST("/api/v1/role-assignments", {
        body: { user, role: "registrar", department },
      });
      if (!data) throw error;
    },
    onSuccess: refresh,
  });
  const unlink = useMutation({
    mutationFn: async (id: number) => {
      const { error, response } = await api.DELETE("/api/v1/role-assignments/{id}", {
        params: { path: { id } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: refresh,
  });
  const registrars = (users.data ?? []).filter((u) => u.roles.some((r) => r.role === "registrar"));
  const coverage = (departments.data ?? []).map((d) => ({
    d,
    who: registrars.filter((u) =>
      u.roles.some((r) => r.role === "registrar" && r.department === d.id),
    ),
  }));
  return (
    <PortalShell
      title={`المسجلون · ${num(registrars.length)}`}
      subtitle="الربط بالأقسام يحدد ما يراه المسجل وما يُوزَّع عليه تلقائيًا. الحسابات تُنشأ من مدير النظام."
      back={{ label: "لوحة القبول", to: "/registrar" }}
    >
      {(link.isError || unlink.isError) && (
        <div className="mb-3">
          <Notice>{problemMessage(link.error ?? unlink.error)}</Notice>
        </div>
      )}
      <SectionLabel>تغطية الأقسام</SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {coverage.map(({ d, who }) => (
          <Card key={d.id} className={`p-3 text-sm ${who.length ? "" : "bg-danger-soft/40"}`}>
            <b className="block text-text">{d.name_ar}</b>
            <span className={who.length ? "text-text-muted" : "font-semibold text-danger-strong"}>
              {who.map((u) => u.full_name_ar).join(" · ") ||
                "بلا مسجل — الطلبات تذهب لمسؤول المسجلين"}
            </span>
          </Card>
        ))}
      </div>
      <SectionLabel>المسجلون والحمل الحالي</SectionLabel>
      <Card className="divide-y divide-border-soft">
        {registrars.map((u) => {
          const links = u.roles.filter((r) => r.role === "registrar" && r.department);
          const missing = (departments.data ?? []).filter(
            (d) => !links.some((r) => r.department === d.id),
          );
          return (
            <div key={u.public_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-700">
                {initials(u.full_name_ar)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-text">{u.full_name_ar}</b>
                <span className="text-xs text-text-muted">
                  <bdi>{u.email}</bdi> · {count(load.data?.[u.public_id] ?? 0, N.application)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {links.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-700"
                  >
                    {r.department_name}
                    <button
                      type="button"
                      aria-label={`فك الربط بـ${r.department_name}`}
                      onClick={() => unlink.mutate(r.id)}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </span>
                ))}
                {!links.length && (
                  <span className="text-xs text-warning-strong">لم يُربط بقسم</span>
                )}
                <select
                  aria-label="ربط بقسم"
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    link.mutate({ user: u.public_id, department: Number(e.target.value) })
                  }
                  className="min-h-8 rounded-full border border-dashed border-border px-2 text-xs text-primary"
                >
                  <option value="">+ قسم</option>
                  {missing.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name_ar}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          );
        })}
        {!registrars.length && <p className="px-4 py-4 text-sm text-text-muted">لا مسجلين.</p>}
      </Card>
    </PortalShell>
  );
}
