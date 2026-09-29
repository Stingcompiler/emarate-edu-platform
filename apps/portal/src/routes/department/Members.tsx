import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { DepartmentSwitch } from "../../components/DepartmentSwitch";
import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
  Button,
  Card,
  Chip,
  Notice,
  SectionLabel,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { can } from "../../lib/nav";
import { TeacherStatus, days, initials, num } from "../../lib/reports";
import { count, N } from "../../lib/format";
import { useConfirm } from "../../components/Confirm";

/** Board: DesktopDeptProfessors (desktop, list + detail); phone derived — list then detail. */
export function Members() {
  const confirm = useConfirm();
  const me = useMe();
  const client = useQueryClient();
  const { id, department } = useDepartment();
  const term = useCurrentTerm();
  const offerings = useOfferings(id, term.data?.id);
  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/departments/{department_id}/members", {
          params: { path: { department_id: id! } },
        }),
      ) ?? [],
  });
  const metrics = useQuery({
    queryKey: ["reports", "teachers", "dash", id],
    enabled: !!id,
    queryFn: async () =>
      ok(await api.GET("/api/v1/reports/teachers", { params: { query: { department: id } } })) ??
      null,
  });
  const [filter, setFilter] = useState<"all" | "teacher" | "ta" | "idle">("all");
  const [picked, setPicked] = useState<string | null>(null);
  const courseOf = (user: string) =>
    (offerings.data ?? []).filter((o) => o.instructors.some((i) => i.user.public_id === user));
  const rows = (members.data ?? []).filter((m) =>
    filter === "all"
      ? true
      : filter === "idle"
        ? !courseOf(m.user.public_id).length
        : m.kind === filter,
  );
  const metric = new Map((metrics.data?.rows ?? []).map((r) => [r.public_id, r]));
  const selected = (members.data ?? []).find((m) => m.user.public_id === picked);
  const remove = useMutation({
    mutationFn: async (membership: number) => {
      const { error, response } = await api.DELETE(
        "/api/v1/departments/{department_id}/members/{membership_id}",
        { params: { path: { department_id: id!, membership_id: membership } } },
      );
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      setPicked(null);
      void client.invalidateQueries({ queryKey: ["members"] });
    },
  });
  const all = members.data ?? [];
  return (
    <PortalShell
      title={`الأساتذة والمعيدون · ${num(all.length)}`}
      subtitle={department?.name_ar}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      <DepartmentSwitch />
      <FilterBar>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", `الكل ${num(all.length)}`],
              ["teacher", `أساتذة ${num(all.filter((m) => m.kind === "teacher").length)}`],
              ["ta", `معيدون ${num(all.filter((m) => m.kind === "ta").length)}`],
              ["idle", "بلا مواد"],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {l}
            </Chip>
          ))}
        </div>
      </FilterBar>
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <Card className="divide-y divide-border-soft">
          {rows.map((m) => {
            const courses = courseOf(m.user.public_id);
            const t = metric.get(m.user.public_id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setPicked(m.user.public_id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt ${picked === m.user.public_id ? "bg-primary-soft/40" : ""}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                  {initials(m.user.full_name_ar)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{m.user.full_name_ar}</b>
                  <span className="block truncate text-xs text-text-muted">
                    {m.kind === "ta" ? "معيد" : "أستاذ"} ·{" "}
                    {courses.map((o) => o.course_detail.code).join(" · ") || "بلا مواد"}
                  </span>
                </span>
                {t ? <TeacherStatus status={t.status} /> : null}
              </button>
            );
          })}
          {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا أعضاء.</p>}
        </Card>
        <aside className="mt-6 space-y-4 lg:mt-0">
          {selected ? (
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-primary-soft font-semibold text-primary-700">
                  {initials(selected.user.full_name_ar)}
                </span>
                <span className="min-w-0">
                  <b className="block text-text">{selected.user.full_name_ar}</b>
                  <span className="text-xs text-text-muted">
                    {selected.kind === "ta" ? "معيد" : "أستاذ"} · انضم{" "}
                    {new Date(selected.created_at).toLocaleDateString("ar-u-nu-latn", {
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    · <bdi>{selected.user.email}</bdi>
                  </span>
                </span>
              </div>
              {metric.get(selected.user.public_id) && (
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <span className="rounded-lg bg-surface-alt p-2">
                    <b className="block text-lg">
                      {num(metric.get(selected.user.public_id)!.offerings)}
                    </b>
                    مواد
                  </span>
                  <span className="rounded-lg bg-surface-alt p-2">
                    <b className="block text-lg">
                      {num(metric.get(selected.user.public_id)!.students)}
                    </b>
                    الطلاب
                  </span>
                  <span className="rounded-lg bg-surface-alt p-2">
                    <b className="block text-lg">
                      {days(metric.get(selected.user.public_id)!.grading_days)}
                    </b>
                    تصحيح
                  </span>
                </div>
              )}
              <SectionLabel>مواده هذا الفصل</SectionLabel>
              {courseOf(selected.user.public_id).map((o) => (
                <p key={o.id} className="text-sm">
                  <bdi className="font-mono text-xs text-text-muted">{o.course_detail.code}</bdi>{" "}
                  {o.course_detail.name_ar} · {count(o.enrolled_count, N.student)}
                </p>
              ))}
              {!courseOf(selected.user.public_id).length && (
                <p className="text-sm text-text-muted">لا مواد — أسند من «المواد والتعيينات».</p>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Link to={`/hr/teachers/${selected.user.public_id}`}>
                  <Button variant="secondary" className="min-h-9 px-3">
                    تقرير الأداء
                  </Button>
                </Link>
                {can(me.data, "membership.remove") && (
                  <Button
                    variant="secondary"
                    className="min-h-9 px-3 text-danger-strong"
                    onClick={async () =>
                      (await confirm({
                        title: `إزالة ${selected.user.full_name_ar} من القسم؟`,
                        body: "تُفك عضويته في القسم فقط؛ لا يُحذف حسابه.",
                        confirm: "إزالة من القسم",
                      })) && remove.mutate(selected.id)
                    }
                  >
                    إزالة من القسم
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-text-muted">
                الإزالة تفكّ ارتباطه بالقسم فقط؛ لا تحذف حسابه.
              </p>
              {remove.isError && <Notice>{problemMessage(remove.error)}</Notice>}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-text-muted">اختر عضوًا لعرض مواده وأدائه.</Card>
          )}
          {can(me.data, "membership.manage") && id && <AddMember department={id} />}
        </aside>
      </div>
    </PortalShell>
  );
}

function AddMember({ department }: { department: number }) {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"teacher" | "ta">("teacher");
  const found = useQuery({
    queryKey: ["teachers-directory", q],
    enabled: q.trim().length >= 2,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/teachers-directory", { params: { query: { search: q.trim() } } }),
      ) ?? [],
  });
  const add = useMutation({
    mutationFn: async (user: string) => {
      const { data, error } = await api.POST("/api/v1/departments/{department_id}/members", {
        params: { path: { department_id: department } },
        body: { user, kind },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setQ("");
      void client.invalidateQueries({ queryKey: ["members"] });
    },
  });
  return (
    <Card className="space-y-2 p-4">
      <p className="font-semibold text-text">+ إضافة عضو</p>
      <div className="flex gap-2">
        <Chip active={kind === "teacher"} onClick={() => setKind("teacher")}>
          أستاذ
        </Chip>
        <Chip active={kind === "ta"} onClick={() => setKind("ta")}>
          معيد
        </Chip>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث بالاسم أو البريد (حساب أستاذ موجود)"
        className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
      />
      {(found.data ?? []).map((p) => (
        <button
          key={p.public_id}
          type="button"
          onClick={() => add.mutate(p.public_id)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-start text-sm hover:bg-surface-alt"
        >
          <span>
            {p.full_name_ar} <bdi className="text-xs text-text-muted">{p.email}</bdi>
          </span>
          <span className="text-xs font-semibold text-primary">إضافة</span>
        </button>
      ))}
      {add.isError && <Notice>{problemMessage(add.error)}</Notice>}
      <p className="text-[11px] text-text-muted">
        حسابات الأساتذة الجدد ينشئها أمين الشؤون العلمية.
      </p>
    </Card>
  );
}
