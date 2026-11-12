import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { useConfirm } from "../components/Confirm";
import { PortalShell } from "../components/PortalShell";
import { Avatar, Button, Card, Notice, problemMessage, SectionLabel } from "../components/ui";
import { ROUTE_ACCESS } from "../lib/access";
import { api, ok } from "../lib/api";
import { useMe } from "../lib/auth";
import { count, DEGREE, N } from "../lib/format";
import { initials, num } from "../lib/reports";
import { siteLink, siteUrl } from "../lib/site";

const LEADS = [
  { role: "department_manager", label: "مدير القسم" },
  { role: "department_supervisor", label: "مشرف القسم" },
] as const;
type Lead = (typeof LEADS)[number]["role"];

/**
 * One department on a page of its own (review 2026-11-12): its details, programmes, leadership
 * and teaching staff, reached from its name in «الهيكل الأكاديمي» and the academic affairs home,
 * so those lists stay names only. Whoever may grant a head or a supervisor (rbac.GRANTS) appoints
 * them here from existing accounts; a programme follows its department's leadership (owner,
 * 2026-11-12). No board: derived from docs/06 §9 — one column on phones; on large screens the
 * details beside the leadership.
 */
export function DepartmentPage() {
  const id = Number(useParams().id);
  const me = useMe();
  const department = useQuery({
    queryKey: ["departments", id],
    queryFn: async () =>
      ok(await api.GET("/api/v1/departments/{id}", { params: { path: { id } } })) ?? null,
  });
  const programs = useQuery({
    queryKey: ["programs", "department", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/programs", {
          params: { query: { department: id, page_size: 100 } as never },
        }),
      )?.results ?? [],
  });
  const leaders = useQuery({
    queryKey: ["department-leaders", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/departments/{department_id}/leaders", {
          params: { path: { department_id: id } },
        }),
      ) ?? [],
  });
  const members = useQuery({
    queryKey: ["members", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/departments/{department_id}/members", {
          params: { path: { department_id: id } },
        }),
      ) ?? [],
  });
  const d = department.data;
  const grantable = me.data?.grantable_roles ?? [];
  const manageMembers = !!me.data && ROUTE_ACCESS["/department/teachers"]!(me.data);
  const staff = members.data ?? [];
  return (
    <PortalShell
      title={d ? (d.name_ar.startsWith("قسم") ? d.name_ar : `قسم ${d.name_ar}`) : "القسم"}
      subtitle={
        d
          ? [d.code, d.is_active === false ? "موقوف مؤقتًا" : null, count(staff.length, N.member)]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
    >
      {department.isError && <Notice>{problemMessage(department.error)}</Notice>}
      {d && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="dept-about">
              <SectionLabel>
                <span id="dept-about">عن القسم</span>
              </SectionLabel>
              <Card className="space-y-3 p-4 text-sm">
                <p className={d.description ? "leading-7" : "text-text-muted"}>
                  {d.description || "لا وصف بعد."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {d.is_active !== false && (
                    <a
                      {...siteLink(siteUrl(`/ar/departments/${d.code}/`))}
                      className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold text-primary hover:bg-surface-alt"
                    >
                      صفحته على موقع الكلية
                    </a>
                  )}
                  {manageMembers && (
                    <Link
                      to={`/department?department=${d.id}`}
                      className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold text-primary hover:bg-surface-alt"
                    >
                      لوحة القسم
                    </Link>
                  )}
                </div>
              </Card>
            </section>
            <section aria-labelledby="dept-programs">
              <SectionLabel>
                <span id="dept-programs">البرامج · {num(programs.data?.length ?? 0)}</span>
              </SectionLabel>
              <Card className="divide-y divide-border-soft">
                {(programs.data ?? []).map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 text-sm">
                      <bdi className="block font-mono text-xs text-text-muted">{p.code}</bdi>
                      <b className="block">{p.name_ar}</b>
                      <span className="text-xs text-text-muted">
                        {DEGREE[p.degree] ?? p.degree} · المستويات: {num(p.levels_count)}
                      </span>
                    </span>
                    {p.is_active === false && (
                      <span className="shrink-0 text-xs text-text-muted">موقوف</span>
                    )}
                  </div>
                ))}
                {!programs.data?.length && (
                  <p className="px-4 py-3 text-sm text-text-muted">لا برامج بعد.</p>
                )}
              </Card>
              <p className="mt-2 text-xs text-text-muted">يتولّى برامجَ القسم مديرُه ومشرفه.</p>
            </section>
            <section aria-labelledby="dept-staff">
              <SectionLabel>
                <span id="dept-staff">هيئة التدريس · {num(staff.length)}</span>
              </SectionLabel>
              <Card className="divide-y divide-border-soft">
                {staff.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar text={initials(m.user.full_name_ar)} size="sm" tone="primary" />
                    <span className="min-w-0 text-sm">
                      <b className="block truncate">{m.user.full_name_ar}</b>
                      <span className="text-xs text-text-muted">
                        {m.kind === "ta" ? "معيد" : "أستاذ"}
                      </span>
                    </span>
                  </div>
                ))}
                {!staff.length && (
                  <p className="px-4 py-3 text-sm text-text-muted">لا أعضاء في القسم بعد.</p>
                )}
              </Card>
              {manageMembers && (
                <Link
                  to={`/department/teachers?department=${d.id}`}
                  className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
                >
                  إضافة عضو أو إزالته
                </Link>
              )}
            </section>
          </div>
          <aside className="min-w-0 space-y-3" aria-labelledby="dept-leads">
            <SectionLabel>
              <span id="dept-leads">قيادة القسم</span>
            </SectionLabel>
            {LEADS.map((lead) => (
              <LeadCard
                key={lead.role}
                department={id}
                role={lead.role}
                label={lead.label}
                holders={(leaders.data ?? []).filter((r) => r.role === lead.role)}
                canAppoint={grantable.includes(lead.role)}
              />
            ))}
          </aside>
        </div>
      )}
    </PortalShell>
  );
}

type Leader = {
  id: number;
  user: { public_id: string; full_name_ar: string; email: string };
};

function LeadCard({
  department,
  role,
  label,
  holders,
  canAppoint,
}: {
  department: number;
  role: Lead;
  label: string;
  holders: Leader[];
  canAppoint: boolean;
}) {
  const confirm = useConfirm();
  const client = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["department-leaders", department] });
    void client.invalidateQueries({ queryKey: ["role-assignments"] });
    void client.invalidateQueries({ queryKey: ["users"] });
  };
  // Existing accounts only (owner, 2026-11-12): nobody creates an account from here.
  const found = useQuery({
    queryKey: ["users", "appoint", q.trim()],
    enabled: picking && q.trim().length >= 2,
    queryFn: async () =>
      (
        ok(
          await api.GET("/api/v1/users", {
            params: { query: { search: q.trim(), is_active: true, page_size: 8 } as never },
          }),
        )?.results ?? []
      ).filter((u) => !u.roles.some((r) => r.role === "student")),
  });
  const appoint = useMutation({
    mutationFn: async (user: string) => {
      const { data, error } = await api.POST("/api/v1/role-assignments", {
        body: { user, role: role as never, department },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setPicking(false);
      setQ("");
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: async (assignment: number) => {
      const { error, response } = await api.DELETE("/api/v1/role-assignments/{id}", {
        params: { path: { id: assignment } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: refresh,
  });
  return (
    <Card className="space-y-3 p-4" data-lead={role}>
      <p className="text-sm font-semibold">{label}</p>
      {holders.map((h) => (
        <div key={h.id} className="flex items-center gap-3">
          <Avatar text={initials(h.user.full_name_ar)} size="sm" tone="primary" />
          <span className="min-w-0 flex-1 text-sm">
            <b className="block truncate">{h.user.full_name_ar}</b>
            <bdi className="block truncate text-xs text-text-muted">{h.user.email}</bdi>
          </span>
          {canAppoint && (
            <Button
              variant="ghost"
              className="min-h-10 shrink-0 px-3 text-sm text-danger-strong"
              disabled={revoke.isPending}
              onClick={async () =>
                (await confirm({
                  title: `إعفاء ${h.user.full_name_ar} من «${label}»؟`,
                  body: "يُسحب الدور في هذا القسم فقط؛ لا يُحذف حسابه.",
                  confirm: "إعفاء",
                })) && revoke.mutate(h.id)
              }
            >
              إعفاء
            </Button>
          )}
        </div>
      ))}
      {!holders.length && (
        <p className="text-sm font-semibold text-danger-strong">لم يُعيَّن بعد.</p>
      )}
      {canAppoint &&
        (picking ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو البريد في الحسابات الموجودة"
              aria-label={`ابحث عن ${label}`}
              className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
            />
            {(found.data ?? []).map((u) => (
              <button
                key={u.public_id}
                type="button"
                disabled={appoint.isPending}
                onClick={() => appoint.mutate(u.public_id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-start text-sm hover:bg-surface-alt"
              >
                <span className="min-w-0">
                  <b className="block truncate">{u.full_name_ar}</b>
                  <bdi className="block truncate text-xs text-text-muted">{u.email}</bdi>
                </span>
                <span className="shrink-0 text-xs font-semibold text-primary">تعيين</span>
              </button>
            ))}
            {q.trim().length >= 2 && found.isSuccess && !found.data.length && (
              <p className="text-xs text-text-muted">لا حساب موظف بهذا الاسم.</p>
            )}
            <Button
              variant="secondary"
              className="min-h-10 w-full"
              onClick={() => setPicking(false)}
            >
              إلغاء
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="min-h-10 w-full" onClick={() => setPicking(true)}>
            {holders.length ? `تعيين ${label} آخر` : `تعيين ${label}`}
          </Button>
        ))}
      {(appoint.isError || revoke.isError) && (
        <Notice>{problemMessage(appoint.error ?? revoke.error)}</Notice>
      )}
    </Card>
  );
}
