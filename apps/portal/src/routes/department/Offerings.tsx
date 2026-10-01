import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useState } from "react";

import { DepartmentSwitch } from "../../components/DepartmentSwitch";
import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  CodeTile,
  FilterBar,
  Notice,
  SectionLabel,
  problemMessage,
  splitCode,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { can } from "../../lib/nav";
import { num } from "../../lib/reports";
import { ALL } from "../../components/Pager";
import { count, N } from "../../lib/format";
import { useConfirm } from "../../components/Confirm";

/** Board: DesktopDeptDashboard «المواد والتعيينات» — assign teachers from the same screen (docs/02 §4.15). */
export function Offerings() {
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
  const report = useQuery({
    queryKey: ["reports", "department", "dash", id],
    enabled: !!id,
    queryFn: async () =>
      ok(await api.GET("/api/v1/reports/department", { params: { query: { department: id } } })) ??
      null,
  });
  const canRemove = can(me.data, "membership.remove");
  const [error, setError] = useState<unknown>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["offerings"] });
  const canDelete = can(me.data, "courses.delete");
  const [editing, setEditing] = useState<number | null>(null);
  const removeOffering = useMutation({
    mutationFn: async (o: { id: number; course: number }) => {
      const { error, response } = await api.DELETE("/api/v1/offerings/{id}", {
        params: { path: { id: o.id } },
      });
      if (!response.ok) throw error;
      // The catalogue course goes too when no other term or section uses it; otherwise the
      // server refuses (in use) and it stays.
      await api.DELETE("/api/v1/courses/{id}", { params: { path: { id: o.course } } });
    },
    onSuccess: refresh,
    onError: setError,
  });
  const assign = useMutation({
    mutationFn: async ({
      offering,
      user,
      role,
    }: {
      offering: number;
      user: string;
      role: "teacher" | "ta";
    }) => {
      const { data, error } = await api.POST("/api/v1/offerings/{id}/instructors", {
        params: { path: { id: offering } },
        body: { user, role },
      });
      if (!data) throw error;
    },
    onSuccess: refresh,
    onError: setError,
  });
  const unassign = useMutation({
    mutationFn: async ({ offering, instructor }: { offering: number; instructor: number }) => {
      const { error, response } = await api.DELETE(
        "/api/v1/offerings/{id}/instructors/{instructor_id}",
        { params: { path: { id: offering, instructor_id: String(instructor) } } },
      );
      if (!response.ok) throw error;
    },
    onSuccess: refresh,
    onError: setError,
  });
  const toggleTaGrading = useMutation({
    mutationFn: async ({ offering, value }: { offering: number; value: boolean }) => {
      const { data, error } = await api.PATCH("/api/v1/offerings/{id}", {
        params: { path: { id: offering } },
        body: { ta_can_grade: value } as never,
      });
      if (!data) throw error;
    },
    onSuccess: refresh,
    onError: setError,
  });
  const rows = offerings.data ?? [];
  const stats = new Map((report.data?.rows ?? []).map((r) => [r.public_id, r]));
  const teachersList = (members.data ?? []).filter((m) => m.kind === "teacher");
  const tasList = (members.data ?? []).filter((m) => m.kind === "ta");
  // Search and filters above the table; on large screens they stay under the top bar.
  const [q, setQ] = useState("");
  // ?filter= (teacher | ta | behind), so the dashboard's «بلا أستاذ» row opens this list filtered.
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("filter");
  const filter = (
    fromUrl === "teacher" || fromUrl === "ta" || fromUrl === "behind" ? fromUrl : "all"
  ) as keyof typeof FILTERS;
  const setFilter = (key: keyof typeof FILTERS) => {
    const next = new URLSearchParams(params);
    if (key === "all") next.delete("filter");
    else next.set("filter", key);
    setParams(next, { replace: true });
  };
  const behind = (o: (typeof rows)[number]) => {
    const s = stats.get(o.public_id);
    return !!s && s.lectures < s.planned / 2;
  };
  const FILTERS = {
    all: { label: "الكل", test: () => true },
    teacher: {
      label: "بلا أستاذ",
      test: (o: (typeof rows)[number]) => !o.instructors.some((i) => i.role === "teacher"),
    },
    ta: {
      label: "بلا معيد",
      test: (o: (typeof rows)[number]) => !o.instructors.some((i) => i.role === "ta"),
    },
    behind: { label: "محاضرات متأخرة", test: behind },
  };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (o) =>
      FILTERS[filter].test(o) &&
      (!needle ||
        o.course_detail.code.toLowerCase().includes(needle) ||
        o.course_detail.name_ar.includes(q.trim()) ||
        o.instructors.some((i) => i.user.full_name_ar.includes(q.trim()))),
  );
  const manage = can(me.data, "courses.manage") && id && term.data;
  return (
    <PortalShell
      title={`المواد والتعيينات · ${num(rows.length)}`}
      subtitle={`${department?.name_ar ?? ""}${term.data ? ` · ${term.data.name_ar}` : ""}`}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      <DepartmentSwitch />
      {error ? (
        <div className="mb-3">
          <Notice>{problemMessage(error)}</Notice>
        </div>
      ) : null}
      <FilterBar className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث برمز المادة أو اسمها أو الأستاذ"
          aria-label="بحث في المواد"
          className="min-h-10 w-full rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm sm:flex-1"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {FILTERS[k].label} {num(rows.filter(FILTERS[k].test).length)}
            </Chip>
          ))}
        </div>
        {manage && (
          <Button
            variant="secondary"
            className="min-h-9 px-3 sm:ms-auto"
            onClick={() => {
              const form = document.getElementById("new-offering");
              form?.scrollIntoView({ block: "center" });
              form?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
            }}
          >
            <Plus size={16} aria-hidden />
            مادة جديدة
          </Button>
        )}
      </FilterBar>
      <Card className="divide-y divide-border-soft">
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_70px_80px_72px] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted xl:grid">
          <span>المادة</span>
          <span>الأستاذ</span>
          <span>المعيد</span>
          <span>الطلاب</span>
          <span>المحاضرات</span>
          <span className="sr-only">إجراءات</span>
        </div>
        {shown.map((o) => {
          const teacher = o.instructors.find((i) => i.role === "teacher");
          const ta = o.instructors.find((i) => i.role === "ta");
          const s = stats.get(o.public_id);
          const [top, bottom] = splitCode(o.course_detail.code);
          return (
            <div
              key={o.id}
              className="grid gap-3 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_70px_80px_72px] xl:items-center"
            >
              <span className="flex items-center gap-3">
                <CodeTile top={top} bottom={bottom} />
                <span className="min-w-0">
                  <Link
                    to={`/courses/${o.id}`}
                    className="tap-44 block truncate font-bold text-text hover:text-primary"
                  >
                    {o.course_detail.name_ar}
                  </Link>
                  <span className="text-xs text-text-muted">
                    شعبة <bdi>{o.section}</bdi> · المستوى {num(o.course_detail.default_level ?? 1)}
                  </span>
                </span>
              </span>
              <Slot
                label="الأستاذ"
                current={teacher}
                options={teachersList.map((m) => ({
                  id: m.user.public_id,
                  name: m.user.full_name_ar,
                }))}
                onAssign={(user) => assign.mutate({ offering: o.id, user, role: "teacher" })}
                onRemove={
                  canRemove && teacher
                    ? () => unassign.mutate({ offering: o.id, instructor: teacher.id })
                    : undefined
                }
              />
              <div>
                <Slot
                  label="المعيد"
                  current={ta}
                  options={tasList.map((m) => ({
                    id: m.user.public_id,
                    name: m.user.full_name_ar,
                  }))}
                  onAssign={(user) => assign.mutate({ offering: o.id, user, role: "ta" })}
                  onRemove={
                    canRemove && ta
                      ? () => unassign.mutate({ offering: o.id, instructor: ta.id })
                      : undefined
                  }
                />
                {ta && (
                  <label className="mt-1 flex items-center gap-1.5 text-[11px] text-text-muted">
                    <input
                      type="checkbox"
                      checked={!!o.ta_can_grade}
                      onChange={(e) =>
                        toggleTaGrading.mutate({ offering: o.id, value: e.target.checked })
                      }
                    />
                    تفويض التصحيح
                  </label>
                )}
              </div>
              {/* Phones: students, lectures and actions share one row (compact cards,
                  review 2026-09-29 PR 7); from xl they are the table's own cells. */}
              <div className="flex items-center gap-3 xl:contents">
                <span className="text-xs text-text-muted xl:text-sm xl:text-text">
                  <span className="hidden xl:inline">{num(o.enrolled_count)}</span>
                  <span className="xl:hidden">{count(o.enrolled_count, N.student)}</span>
                </span>
                <span
                  className={`text-xs xl:text-sm ${s && s.lectures < s.planned / 2 ? "font-semibold text-danger-strong" : "text-text-muted xl:text-text"}`}
                >
                  {s ? `${num(s.lectures)}/${num(s.planned)}` : "—"}
                  <span className="xl:hidden"> محاضرات</span>
                </span>
                <span className="ms-auto flex items-center gap-1 xl:ms-0 xl:justify-end">
                  {manage && (
                    <button
                      type="button"
                      aria-label={`تعديل ${o.course_detail.name_ar}`}
                      aria-expanded={editing === o.id}
                      onClick={() => setEditing(editing === o.id ? null : o.id)}
                      className="grid size-9 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-primary"
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      aria-label={`حذف ${o.course_detail.name_ar}`}
                      onClick={async () =>
                        (await confirm({
                          title: `حذف «${o.course_detail.name_ar}» من هذا الفصل؟`,
                          body: `شعبة ${o.section}. لا تُحذف مادة عليها تسجيل طلاب — يرفضها النظام.`,
                          confirm: "حذف المادة",
                        })) && removeOffering.mutate({ id: o.id, course: o.course_detail.id })
                      }
                      className="grid size-9 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-danger-strong"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  )}
                </span>
              </div>
              {editing === o.id && (
                <EditOffering
                  offering={o}
                  onDone={() => {
                    setEditing(null);
                    refresh();
                  }}
                />
              )}
            </div>
          );
        })}
        {!rows.length ? (
          <p className="px-4 py-5 text-sm text-text-muted">لا مواد في هذا الفصل.</p>
        ) : (
          !shown.length && (
            <p className="px-4 py-5 text-sm text-text-muted">لا مواد تطابق البحث أو التصفية.</p>
          )
        )}
      </Card>
      {manage && <NewOffering department={id} term={term.data!.id} onDone={refresh} />}
    </PortalShell>
  );
}

function Slot({
  label,
  current,
  options,
  onAssign,
  onRemove,
}: {
  label: string;
  current?: { user: { full_name_ar: string } };
  options: { id: string; name: string }[];
  onAssign: (user: string) => void;
  onRemove?: () => void;
}) {
  if (current)
    return (
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          <span className="text-xs text-text-muted xl:hidden">{label}: </span>
          {current.user.full_name_ar}
        </span>
        {onRemove && (
          <button
            type="button"
            aria-label={`إزالة ${label}`}
            onClick={onRemove}
            className="grid size-10 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-danger-strong lg:size-7"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </span>
    );
  return (
    <select
      aria-label={`تعيين ${label}`}
      value=""
      onChange={(e) => e.target.value && onAssign(e.target.value)}
      className="min-h-9 w-full rounded-lg border border-dashed border-border bg-surface px-2 text-xs text-primary"
    >
      <option value="">+ تعيين {label}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

type CourseSummary = Schemas["CourseSummary"];

/** Correct a course's details and its section in place (courses.manage, owner 2026-09-29). */
function EditOffering({
  offering,
  onDone,
}: {
  offering: { id: number; section: string; course_detail: CourseSummary };
  onDone: () => void;
}) {
  const c = offering.course_detail;
  const [f, setF] = useState({
    code: c.code,
    name_ar: c.name_ar,
    credit_hours: c.credit_hours ?? 3,
    default_level: c.default_level ?? 1,
    section: offering.section,
  });
  const save = useMutation({
    mutationFn: async () => {
      const course = await api.PATCH("/api/v1/courses/{id}", {
        params: { path: { id: c.id } },
        body: {
          code: f.code.trim().toUpperCase(),
          name_ar: f.name_ar.trim(),
          credit_hours: f.credit_hours,
          default_level: f.default_level,
        } as never,
      });
      if (!course.data) throw course.error;
      if (f.section.trim() !== offering.section) {
        const section = await api.PATCH("/api/v1/offerings/{id}", {
          params: { path: { id: offering.id } },
          body: { section: f.section.trim() } as never,
        });
        if (!section.data) throw section.error;
      }
    },
    onSuccess: onDone,
  });
  const input = "min-h-10 rounded-lg border border-border bg-surface px-3 text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="col-span-full grid gap-2 rounded-xl bg-surface-alt p-3 sm:grid-cols-[110px_minmax(0,1fr)_90px_90px_70px_auto]"
    >
      <input
        dir="ltr"
        value={f.code}
        onChange={(e) => setF({ ...f, code: e.target.value })}
        aria-label="رمز المادة"
        className={input}
      />
      <input
        value={f.name_ar}
        onChange={(e) => setF({ ...f, name_ar: e.target.value })}
        aria-label="اسم المادة"
        className={input}
      />
      <label className="flex items-center gap-1 text-xs text-text-muted">
        ساعات
        <input
          type="number"
          min={1}
          max={12}
          value={f.credit_hours}
          onChange={(e) => setF({ ...f, credit_hours: Number(e.target.value) })}
          className="w-12 rounded border border-border bg-surface px-1 py-1"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-text-muted">
        مستوى
        <input
          type="number"
          min={1}
          max={10}
          value={f.default_level}
          onChange={(e) => setF({ ...f, default_level: Number(e.target.value) })}
          className="w-12 rounded border border-border bg-surface px-1 py-1"
        />
      </label>
      <input
        dir="ltr"
        value={f.section}
        onChange={(e) => setF({ ...f, section: e.target.value })}
        aria-label="الشعبة"
        className={input}
      />
      <Button type="submit" disabled={!f.code.trim() || !f.name_ar.trim() || save.isPending}>
        حفظ
      </Button>
      {save.isError && (
        <div className="col-span-full">
          <Notice>{problemMessage(save.error)}</Notice>
        </div>
      )}
    </form>
  );
}

function NewOffering({
  department,
  term,
  onDone,
}: {
  department: number;
  term: number;
  onDone: () => void;
}) {
  const programs = useQuery({
    queryKey: ["programs", department],
    queryFn: async () =>
      ok(await api.GET("/api/v1/programs", { params: { query: { ...ALL, department } as never } }))
        ?.results ?? [],
  });
  const [f, setF] = useState({
    code: "",
    name_ar: "",
    credit_hours: 3,
    default_level: 1,
    program: "",
    section: "A",
  });
  const create = useMutation({
    mutationFn: async () => {
      const course = await api.POST("/api/v1/courses", {
        body: {
          department,
          code: f.code.trim().toUpperCase(),
          name_ar: f.name_ar,
          credit_hours: f.credit_hours,
          default_level: f.default_level,
          program: f.program ? Number(f.program) : null,
        } as never,
      });
      if (!course.data) throw course.error;
      const offering = await api.POST("/api/v1/offerings", {
        body: { course: course.data.id, term, section: f.section } as never,
      });
      if (!offering.data) throw offering.error;
    },
    onSuccess: () => {
      setF({ ...f, code: "", name_ar: "" });
      onDone();
    },
  });
  const input = "min-h-10 rounded-lg border border-border bg-surface px-3 text-sm";
  return (
    <section id="new-offering">
      <SectionLabel>مادة جديدة هذا الفصل</SectionLabel>
      <Card className="grid gap-2 p-4 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_90px_90px_70px_auto]">
        <input
          dir="ltr"
          value={f.code}
          onChange={(e) => setF({ ...f, code: e.target.value })}
          placeholder="IT305"
          aria-label="رمز المادة"
          className={input}
        />
        <input
          value={f.name_ar}
          onChange={(e) => setF({ ...f, name_ar: e.target.value })}
          placeholder="اسم المادة"
          aria-label="اسم المادة"
          className={input}
        />
        <select
          value={f.program}
          onChange={(e) => setF({ ...f, program: e.target.value })}
          aria-label="البرنامج"
          className={input}
        >
          <option value="">كل البرامج</option>
          {(programs.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name_ar}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-text-muted">
          ساعات
          <input
            type="number"
            min={1}
            max={12}
            value={f.credit_hours}
            onChange={(e) => setF({ ...f, credit_hours: Number(e.target.value) })}
            className="w-12 rounded border border-border px-1 py-1"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-text-muted">
          مستوى
          <input
            type="number"
            min={1}
            max={10}
            value={f.default_level}
            onChange={(e) => setF({ ...f, default_level: Number(e.target.value) })}
            className="w-12 rounded border border-border px-1 py-1"
          />
        </label>
        <input
          dir="ltr"
          value={f.section}
          onChange={(e) => setF({ ...f, section: e.target.value })}
          aria-label="الشعبة"
          className={input}
        />
        <Button
          disabled={!f.code.trim() || !f.name_ar.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus size={16} aria-hidden /> إضافة
        </Button>
      </Card>
      {create.isError && (
        <div className="mt-2">
          <Notice>{problemMessage(create.error)}</Notice>
        </div>
      )}
    </section>
  );
}
