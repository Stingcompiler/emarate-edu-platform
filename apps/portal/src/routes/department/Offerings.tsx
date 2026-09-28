import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  CodeTile,
  Notice,
  SectionLabel,
  problemMessage,
  splitCode,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { can } from "../../lib/nav";
import { num } from "../../lib/reports";

/** Board: DesktopDeptDashboard «المواد والتعيينات» — assign teachers from the same screen (docs/02 §4.15). */
export function Offerings() {
  const me = useMe();
  const client = useQueryClient();
  const { id, department } = useDepartment();
  const term = useCurrentTerm();
  const offerings = useOfferings(id, term.data?.id);
  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: async () =>
      (
        await api.GET("/api/v1/departments/{department_id}/members", {
          params: { path: { department_id: id! } },
        })
      ).data ?? [],
  });
  const report = useQuery({
    queryKey: ["reports", "department", "dash", id],
    enabled: !!id,
    queryFn: async () =>
      (await api.GET("/api/v1/reports/department", { params: { query: { department: id } } }))
        .data ?? null,
  });
  const canRemove = can(me.data, "membership.remove");
  const [error, setError] = useState<unknown>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["offerings"] });
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
  return (
    <PortalShell
      title={`المواد والتعيينات · ${num(rows.length)}`}
      subtitle={`${department?.name_ar ?? ""}${term.data ? ` · ${term.data.name_ar}` : ""}`}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      {error ? (
        <div className="mb-3">
          <Notice>{problemMessage(error)}</Notice>
        </div>
      ) : null}
      <Card className="divide-y divide-border-soft">
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_70px_80px] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted xl:grid">
          <span>المادة</span>
          <span>الأستاذ</span>
          <span>المعيد</span>
          <span>الطلاب</span>
          <span>المحاضرات</span>
        </div>
        {rows.map((o) => {
          const teacher = o.instructors.find((i) => i.role === "teacher");
          const ta = o.instructors.find((i) => i.role === "ta");
          const s = stats.get(o.public_id);
          const [top, bottom] = splitCode(o.course_detail.code);
          return (
            <div
              key={o.id}
              className="grid gap-3 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_70px_80px] xl:items-center"
            >
              <span className="flex items-center gap-3">
                <CodeTile top={top} bottom={bottom} />
                <span className="min-w-0">
                  <b className="block truncate text-text">{o.course_detail.name_ar}</b>
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
              <span className="text-xs text-text-muted xl:text-sm xl:text-text">
                {num(o.enrolled_count)}
                <span className="xl:hidden"> طالبًا</span>
              </span>
              <span
                className={`text-xs xl:text-sm ${s && s.lectures < s.planned / 2 ? "font-semibold text-danger-strong" : "text-text-muted xl:text-text"}`}
              >
                {s ? `${num(s.lectures)}/${num(s.planned)}` : "—"}
                <span className="xl:hidden"> محاضرات</span>
              </span>
            </div>
          );
        })}
        {!rows.length && <p className="px-4 py-5 text-sm text-text-muted">لا مواد في هذا الفصل.</p>}
      </Card>
      {can(me.data, "courses.manage") && id && term.data && (
        <NewOffering department={id} term={term.data.id} onDone={refresh} />
      )}
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
            className="grid size-7 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-danger-strong"
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
      (await api.GET("/api/v1/programs", { params: { query: { department } as never } })).data
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
    <>
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
    </>
  );
}
