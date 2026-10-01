import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
  Button,
  Card,
  Chip,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { hasRole, useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { initials, num, useDepartments } from "../../lib/reports";
import { DEPARTMENT_ROLES, ROLE_LABEL } from "./roles";
import { Pager } from "../../components/Pager";

/** Board: SystemAdminUsers (phone); desktop derived — list beside "new staff account". */
export function AdminUsers() {
  const me = useMe();
  const admin = hasRole(me.data, "system_admin");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<boolean | undefined>(true);
  const [page, setPage] = useState(1);
  // The role filter, with each role's count (review 2026-09-29 PR 7); kept in the address so
  // «من يحمل هذا الدور» on the roles page lands here filtered.
  const [params, setParams] = useSearchParams();
  const role = params.get("role") ?? "";
  const counts = useQuery({
    queryKey: ["role-assignments", "counts"],
    queryFn: async () =>
      (
        ok(await api.GET("/api/v1/role-assignments/counts")) as {
          counts: Record<string, number>;
        } | null
      )?.counts ?? {},
  });
  const list = useQuery({
    queryKey: ["users", search, active, role, page],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/users", {
          params: {
            query: {
              search: search || undefined,
              is_active: active,
              role: role || undefined,
              page,
            } as never,
          },
        }),
      ) ?? null,
  });
  const rows = list.data?.results ?? [];
  return (
    <PortalShell
      title={`المستخدمون · ${num(list.data?.count ?? 0)}`}
      subtitle={
        admin
          ? "الأدوار الإدارية تُنشأ هنا · الطلاب من القبول · الأساتذة من الشؤون العلمية"
          : "حسابات الأساتذة والمعيدين"
      }
      back={admin ? { label: "إدارة النظام", to: "/system" } : { label: "الرئيسية", to: "/" }}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div>
          <FilterBar>
            {/* Phone: search on its own line, filters scroll sideways (board SystemAdminUsers). */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="بحث بالاسم أو البريد"
                aria-label="بحث بالاسم أو البريد"
                className="min-h-11 rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm sm:flex-1"
              />
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <Chip
                  active={active === true}
                  onClick={() => {
                    setActive(true);
                    setPage(1);
                  }}
                >
                  نشط
                </Chip>
                <Chip
                  active={active === false}
                  onClick={() => {
                    setActive(false);
                    setPage(1);
                  }}
                >
                  معطّل
                </Chip>
                <Chip
                  active={active === undefined}
                  onClick={() => {
                    setActive(undefined);
                    setPage(1);
                  }}
                >
                  الكل
                </Chip>
              </div>
              {Object.keys(counts.data ?? {}).length > 0 && (
                <select
                  value={role}
                  onChange={(e) => {
                    const next = new URLSearchParams(params);
                    if (e.target.value) next.set("role", e.target.value);
                    else next.delete("role");
                    setParams(next, { replace: true });
                    setPage(1);
                  }}
                  aria-label="الدور"
                  className="min-h-11 rounded-full border border-border-soft bg-surface px-3 text-sm sm:min-h-10"
                >
                  <option value="">كل الأدوار</option>
                  {Object.entries(counts.data ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => (
                      <option key={k} value={k}>
                        {ROLE_LABEL[k] ?? k} · {num(n)}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </FilterBar>
          <Card className="mt-3 divide-y divide-border-soft">
            {rows.map((u) => (
              <Link
                key={u.public_id}
                to={`/system/users/${u.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                  {initials(u.full_name_ar)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{u.full_name_ar}</b>
                  <span className="block truncate text-xs text-text-muted">
                    {u.roles
                      .map(
                        (r) =>
                          `${ROLE_LABEL[r.role] ?? r.role}${r.department_name ? ` · ${r.department_name}` : ""}`,
                      )
                      .join("، ") || "بلا دور"}{" "}
                    · {u.last_login ? `دخول ${when(u.last_login)}` : "لم يفعّل الحساب"}
                  </span>
                </span>
                <StatusBadge
                  status={u.is_active ? (u.last_login ? "approved" : "pending") : "closed"}
                  label={u.is_active ? (u.last_login ? "نشط" : "دعوة معلّقة") : "معطّل"}
                />
              </Link>
            ))}
            {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا نتائج.</p>}
          </Card>
          <Pager page={page} count={list.data?.count ?? 0} onPage={setPage} />
        </div>
        <aside className="mt-6 lg:mt-0">
          <NewUser />
        </aside>
      </div>
    </PortalShell>
  );
}

function NewUser() {
  const client = useQueryClient();
  const departments = useDepartments();
  // Only the roles the server accepts from this user (rbac.CREATABLE_ACCOUNTS).
  const allowed = useMe().data?.creatable_roles ?? [];
  const [f, setF] = useState({ full_name_ar: "", email: "", role: "", department: "" });
  // Never default to the most powerful role; the admin picks it deliberately.
  const offered = Object.keys(ROLE_LABEL).filter((k) => allowed.includes(k));
  const role = f.role || offered.find((k) => k !== "system_admin") || offered[0] || "";
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/users", {
        body: {
          full_name_ar: f.full_name_ar,
          email: f.email,
          role: role as never,
          department: DEPARTMENT_ROLES.has(role) && f.department ? Number(f.department) : null,
        },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setF({ ...f, full_name_ar: "", email: "" });
      void client.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const input = "block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm";
  return (
    <>
      <SectionLabel>
        {allowed.includes("system_admin") ? "مستخدم إداري جديد" : "حساب أستاذ / معيد جديد"}
      </SectionLabel>
      <Card className="space-y-2 p-4">
        <input
          value={f.full_name_ar}
          onChange={(e) => setF({ ...f, full_name_ar: e.target.value })}
          placeholder="الاسم الكامل"
          aria-label="الاسم الكامل"
          className={input}
        />
        <input
          dir="ltr"
          type="email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          placeholder="name@ecst.edu.sd"
          aria-label="البريد الإلكتروني"
          className={input}
        />
        <select
          value={role}
          onChange={(e) => setF({ ...f, role: e.target.value })}
          className={input}
          aria-label="الدور"
        >
          {Object.entries(ROLE_LABEL)
            .filter(([k]) => allowed.includes(k))
            .map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
        </select>
        {DEPARTMENT_ROLES.has(role) && (
          <select
            value={f.department}
            onChange={(e) => setF({ ...f, department: e.target.value })}
            className={input}
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
        {create.isError && <Notice>{problemMessage(create.error)}</Notice>}
        {create.isSuccess && (
          <Notice tone="success">أُنشئ الحساب وأُرسل رابط التفعيل (صالح 7 أيام) إلى بريده.</Notice>
        )}
        <Button
          className="w-full"
          disabled={
            !f.full_name_ar.trim() ||
            !f.email.includes("@") ||
            (DEPARTMENT_ROLES.has(role) && !f.department) ||
            create.isPending
          }
          onClick={() => create.mutate()}
        >
          إنشاء وإرسال رابط التفعيل
        </Button>
      </Card>
    </>
  );
}
