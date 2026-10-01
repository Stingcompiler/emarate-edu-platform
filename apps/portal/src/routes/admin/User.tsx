import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { initials, useDepartments } from "../../lib/reports";
import { DEPARTMENT_ROLES, ROLE_LABEL, ROLE_ORDER } from "./roles";
import { useConfirm } from "../../components/Confirm";
import { useToast } from "../../components/Toast";

/** Board: SystemAdminUser (phone); desktop derived — account beside roles and scopes. */
export function AdminUser() {
  const confirm = useConfirm();
  const { id = "" } = useParams();
  const client = useQueryClient();
  const departments = useDepartments();
  const user = useQuery({
    queryKey: ["user", id],
    queryFn: async () =>
      ok(await api.GET("/api/v1/users/{public_id}", { params: { path: { public_id: id } } })) ??
      null,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["user", id] });
    void client.invalidateQueries({ queryKey: ["users"] });
  };
  // Only roles the server lets this user grant (rbac.GRANTS).
  const grantable = useMe().data?.grantable_roles ?? [];
  const [picked, setRole] = useState("");
  const role = picked; // nothing preselected: the admin chooses (review 2026-09-29)
  const [department, setDepartment] = useState("");
  const toast = useToast();
  const grant = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/role-assignments", {
        body: {
          user: id,
          role: role as never,
          department: DEPARTMENT_ROLES.has(role) && department ? Number(department) : null,
        },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      toast("مُنح الدور");
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
  const active = useMutation({
    mutationFn: async (value: boolean) => {
      const { data, error } = await api.POST("/api/v1/users/{public_id}/set-active", {
        params: { path: { public_id: id } },
        body: { is_active: value },
      });
      if (!data) throw error;
    },
    onSuccess: refresh,
  });
  const u = user.data;
  const err = grant.error ?? revoke.error ?? active.error;
  return (
    <PortalShell
      title={u?.full_name_ar ?? "مستخدم"}
      subtitle={u?.email}
      back={{ label: "المستخدمون", to: "/system/users" }}
    >
      {u && (
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="space-y-4">
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-12 place-items-center rounded-full bg-primary-soft font-semibold text-primary-700">
                {initials(u.full_name_ar)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-text">{u.full_name_ar}</b>
                <bdi className="text-xs text-text-muted">{u.email}</bdi>
              </span>
              <StatusBadge
                status={u.is_active ? (u.last_login ? "approved" : "pending") : "closed"}
                label={u.is_active ? (u.last_login ? "نشط" : "دعوة معلّقة") : "معطّل"}
              />
            </Card>
            <SectionLabel>الحساب</SectionLabel>
            <Card className="divide-y divide-border-soft text-sm">
              {[
                ["الهاتف", u.phone_e164 ? <bdi key="p">{u.phone_e164}</bdi> : "—"],
                [
                  "آخر دخول",
                  u.last_login
                    ? new Date(u.last_login).toLocaleString("ar-u-nu-latn")
                    : "لم يفعّل الحساب بعد",
                ],
              ].map(([k, v]) => (
                <p key={String(k)} className="flex justify-between px-4 py-2.5">
                  <span className="text-text-muted">{k}</span>
                  <span>{v}</span>
                </p>
              ))}
            </Card>
            {err ? <Notice>{problemMessage(err)}</Notice> : null}
            <Button
              variant="secondary"
              className={u.is_active ? "text-danger-strong" : ""}
              onClick={async () =>
                (!u.is_active ||
                  (await confirm({
                    title: `تعطيل حساب ${u.full_name_ar}؟`,
                    body: "يخرج من كل أجهزته ولا يستطيع الدخول حتى يُعاد تفعيله. لا يُحذف شيء.",
                    confirm: "تعطيل الحساب",
                  }))) &&
                active.mutate(!u.is_active)
              }
              disabled={active.isPending}
            >
              {u.is_active ? "تعطيل الحساب" : "إعادة تفعيل الحساب"}
            </Button>
            <p className="text-xs text-text-muted">
              التعطيل يُنهي كل جلساته فورًا ولا يحذف شيئًا من سجلاته.
            </p>
          </div>
          <div className="mt-6 space-y-4 lg:mt-0">
            <SectionLabel>الأدوار والنطاقات</SectionLabel>
            <Card className="divide-y divide-border-soft">
              {u.roles.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <b className="block">{ROLE_LABEL[r.role] ?? r.role}</b>
                    <span className="text-xs text-text-muted">
                      {r.department_name ? `النطاق: ${r.department_name}` : "على مستوى الكلية"}
                    </span>
                  </span>
                  {grantable.includes(r.role) && (
                    <button
                      type="button"
                      aria-label="سحب الدور"
                      onClick={async () =>
                        (await confirm({
                          title: `سحب دور «${r.role_label}»؟`,
                          body: r.department_name
                            ? `من ${u.full_name_ar} في ${r.department_name}.`
                            : `من ${u.full_name_ar}.`,
                          confirm: "سحب الدور",
                        })) && revoke.mutate(r.id)
                      }
                      className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-danger-strong"
                    >
                      <X size={15} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {!u.roles.length && <p className="px-4 py-3 text-sm text-text-muted">بلا أدوار.</p>}
            </Card>
            {(grant.isError || revoke.isError) && (
              <Notice>{problemMessage(grant.error ?? revoke.error)}</Notice>
            )}
            {grantable.length > 0 && (
              <Card className="space-y-2 p-4">
                <p className="text-sm font-semibold">+ إضافة دور أو نطاق</p>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                  aria-label="الدور"
                >
                  <option value="">اختر الدور…</option>
                  {ROLE_ORDER.filter(
                    (k) =>
                      grantable.includes(k) &&
                      // A department role can be held for several departments; others only once.
                      (DEPARTMENT_ROLES.has(k) || !u.roles.some((r) => r.role === k)),
                  ).map((k) => (
                    <option key={k} value={k}>
                      {ROLE_LABEL[k]}
                    </option>
                  ))}
                </select>
                {DEPARTMENT_ROLES.has(role) && (
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                    aria-label="القسم"
                  >
                    <option value="">اختر القسم</option>
                    {(departments.data ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name_ar}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  className="w-full"
                  disabled={!role || (DEPARTMENT_ROLES.has(role) && !department) || grant.isPending}
                  onClick={() => grant.mutate()}
                >
                  إضافة
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
