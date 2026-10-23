import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { useConfirm } from "../../components/Confirm";
import { DataTable, type Sort, orderingOf } from "../../components/DataTable";
import { PortalShell } from "../../components/PortalShell";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Field,
  FilterBar,
  Notice,
  problemMessage,
  SectionLabel,
  SelectField,
  StatusBadge,
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
  const [sort, setSort] = useState<Sort>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const confirm = useConfirm();
  const client = useQueryClient();
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
    queryKey: ["users", search, active, role, page, orderingOf(sort)],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/users", {
          params: {
            query: {
              search: search || undefined,
              is_active: active,
              role: role || undefined,
              ordering: orderingOf(sort),
              page,
            } as never,
          },
        }),
      ) ?? null,
  });
  const rows = list.data?.results ?? [];
  // Enabling or disabling several accounts at once (system admin): the same call as the user's
  // own page, once per account, each logged; one's own account is never in it.
  const bulk = useMutation({
    mutationFn: async (value: boolean) => {
      const failed: string[] = [];
      for (const id of picked) {
        if (id === me.data?.public_id) continue;
        const { data } = await api.POST("/api/v1/users/{public_id}/set-active", {
          params: { path: { public_id: id } },
          body: { is_active: value },
        });
        if (!data) failed.push(id);
      }
      if (failed.length) throw { detail: `تعذّر تغيير ${failed.length} من الحسابات المحددة.` };
    },
    onSettled: () => {
      setPicked(new Set());
      void client.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const askBulk = async (value: boolean) => {
    const mine = picked.has(me.data?.public_id ?? "");
    const n = picked.size - (mine ? 1 : 0);
    const ok_ = await confirm({
      title: value ? `تفعيل ${num(n)} حسابًا؟` : `تعطيل ${num(n)} حسابًا؟`,
      body: value
        ? "تعود الحسابات المحددة إلى الدخول."
        : "لا يستطيع أصحاب الحسابات المحددة الدخول حتى تُفعَّل من جديد. حسابك لا يدخل في التغيير.",
      confirm: value ? "تفعيل" : "تعطيل",
      tone: value ? "primary" : "danger",
    });
    if (ok_) bulk.mutate(value);
  };
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
          <div className="lg:hidden">
            <Card className="mt-3 divide-y divide-border-soft">
              {rows.map((u) => (
                <Link
                  key={u.public_id}
                  to={`/system/users/${u.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <Avatar text={initials(u.full_name_ar)} size="md" tone="primary" />
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
          </div>
          {/* Large screens: a table, with bulk actions for the system admin (design review B7). */}
          <DataTable
            caption="المستخدمون"
            rows={rows}
            rowId={(u) => u.public_id}
            sort={sort}
            onSort={(next) => {
              setSort(next);
              setPage(1);
            }}
            selection={
              admin
                ? {
                    picked,
                    onChange: setPicked,
                    label: (u) => `تحديد ${u.full_name_ar}`,
                  }
                : undefined
            }
            bulkBar={
              <Card className="mt-3 flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-semibold">{num(picked.size)} محددة</span>
                <Button
                  variant="danger"
                  className="min-h-10 px-4"
                  onClick={() => askBulk(false)}
                  disabled={bulk.isPending}
                >
                  تعطيل
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-10 px-4"
                  onClick={() => askBulk(true)}
                  disabled={bulk.isPending}
                >
                  تفعيل
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-10 px-3"
                  onClick={() => setPicked(new Set())}
                >
                  إلغاء التحديد
                </Button>
              </Card>
            }
            columns={[
              {
                key: "name",
                header: "الاسم",
                sort: "full_name_ar",
                cell: (u) => (
                  <Link to={`/system/users/${u.public_id}`} className="flex items-center gap-3">
                    <Avatar text={initials(u.full_name_ar)} size="md" tone="primary" />
                    <span className="min-w-0">
                      <b className="block truncate text-text">{u.full_name_ar}</b>
                      <span className="block truncate text-xs text-text-muted" dir="ltr">
                        {u.email}
                      </span>
                    </span>
                  </Link>
                ),
              },
              {
                key: "roles",
                header: "الدور",
                cell: (u) =>
                  u.roles
                    .map(
                      (r) =>
                        `${ROLE_LABEL[r.role] ?? r.role}${r.department_name ? ` · ${r.department_name}` : ""}`,
                    )
                    .join("، ") || "بلا دور",
              },
              {
                key: "status",
                header: "الحالة",
                cell: (u) => (
                  <StatusBadge
                    status={u.is_active ? (u.last_login ? "approved" : "pending") : "closed"}
                    label={u.is_active ? (u.last_login ? "نشط" : "دعوة معلّقة") : "معطّل"}
                  />
                ),
              },
              {
                key: "login",
                header: "آخر دخول",
                sort: "last_login",
                cell: (u) => (u.last_login ? when(u.last_login) : "لم يفعّل الحساب"),
              },
            ]}
          />
          {bulk.isError && (
            <div className="mt-2">
              <Notice>{problemMessage(bulk.error)}</Notice>
            </div>
          )}
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
  return (
    <>
      <SectionLabel>
        {allowed.includes("system_admin") ? "مستخدم إداري جديد" : "حساب أستاذ / معيد جديد"}
      </SectionLabel>
      <Card className="overflow-hidden">
        <Field
          label="الاسم الكامل"
          requiredMark
          value={f.full_name_ar}
          onChange={(e) => setF({ ...f, full_name_ar: e.target.value })}
          placeholder="مثال: أحمد محمد علي"
          autoComplete="off"
        />
        <Field
          label="البريد الإلكتروني"
          requiredMark
          dir="ltr"
          type="email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          placeholder="name@ecst.edu.sd"
          autoComplete="off"
          hint="يصله رابط التفعيل عليه"
        />
        <SelectField
          label="الدور"
          requiredMark
          value={role}
          onChange={(e) => setF({ ...f, role: e.target.value })}
        >
          {Object.entries(ROLE_LABEL)
            .filter(([k]) => allowed.includes(k))
            .map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
        </SelectField>
        {DEPARTMENT_ROLES.has(role) && (
          <SelectField
            label="القسم"
            requiredMark
            value={f.department}
            onChange={(e) => setF({ ...f, department: e.target.value })}
          >
            <option value="">اختر القسم</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name_ar}
              </option>
            ))}
          </SelectField>
        )}
        <div className="space-y-2 p-4">
          {create.isError && <Notice>{problemMessage(create.error)}</Notice>}
          {create.isSuccess && (
            <Notice tone="success">
              أُنشئ الحساب وأُرسل رابط التفعيل (صالح 7 أيام) إلى بريده.
            </Notice>
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
        </div>
      </Card>
    </>
  );
}
