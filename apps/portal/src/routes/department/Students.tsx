import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field,
  FilterBar,
  Notice,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useDepartment } from "../../lib/department";
import { can } from "../../lib/nav";
import { initials, num } from "../../lib/reports";
import { ALL, Pager } from "../../components/Pager";

type Student = Schemas["StudentRecord"];

const STATUS: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف",
  graduated: "متخرج",
  withdrawn: "منسحب",
};

/**
 * Department students: search, level and status filters (§4.15 «طلاب القسم»); phone cards,
 * desktop table. The manager and supervisor add and correct records of their department;
 * the manager deletes one added by mistake (owner 2026-09-29).
 */
export function DepartmentStudents() {
  const me = useMe();
  const client = useQueryClient();
  const { id, department } = useDepartment();
  const canManage = can(me.data, "students.manage");
  const canDelete = can(me.data, "students.delete");
  // The side panel: a record's details, its edit form, or the new-student form.
  const [mode, setMode] = useState<"view" | "edit" | "new">("view");
  const panel = useRef<HTMLElement>(null);
  const open = (next: "edit" | "new") => {
    setMode(next);
    // Phones show the panel under the list; bring it into view.
    requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "start" }));
  };
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<number | undefined>();
  const [status, setStatus] = useState<string>("active");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["students", id, search, level, status, page],
    enabled: !!id,
    queryFn: async () =>
      (
        await api.GET("/api/v1/students", {
          params: {
            query: {
              department: id,
              search: search || undefined,
              level,
              status: (status || undefined) as never,
              page,
            },
          },
        })
      ).data ?? null,
  });
  const rows = list.data?.results ?? [];
  const s = rows.find((r) => r.public_id === picked);
  const refresh = () => client.invalidateQueries({ queryKey: ["students"] });
  const remove = useMutation({
    mutationFn: async (publicId: string) => {
      const { error, response } = await api.DELETE("/api/v1/students/{public_id}", {
        params: { path: { public_id: publicId } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      setPicked(null);
      refresh();
    },
  });
  return (
    <PortalShell
      title={`طلاب القسم · ${num(list.data?.count ?? 0)}`}
      subtitle={department?.name_ar}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="بحث بالاسم أو الرقم الجامعي"
            className="min-h-10 flex-1 rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm"
          />
          {[undefined, 1, 2, 3, 4].map((l) => (
            <Chip
              key={l ?? 0}
              active={level === l}
              onClick={() => {
                setLevel(l);
                setPage(1);
              }}
            >
              {l ? `م${num(l)}` : "كل المستويات"}
            </Chip>
          ))}
          {canManage && (
            <Button className="min-h-9 px-3 sm:ms-auto" onClick={() => open("new")}>
              <Plus size={16} aria-hidden />
              طالب
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {["active", "suspended", "graduated", "withdrawn", ""].map((k) => (
            <Chip
              key={k || "all"}
              active={status === k}
              onClick={() => {
                setStatus(k);
                setPage(1);
              }}
            >
              {k ? STATUS[k] : "كل الحالات"}
            </Chip>
          ))}
        </div>
      </FilterBar>
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div>
          <Card className="divide-y divide-border-soft">
            {rows.map((r) => (
              <button
                key={r.public_id}
                type="button"
                onClick={() => {
                  setPicked(r.public_id);
                  setMode("view");
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                  {initials(r.full_name_ar)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{r.full_name_ar}</b>
                  <span className="text-xs text-text-muted">
                    <bdi>{r.university_number}</bdi> · {r.program_name} · المستوى {num(r.level)}
                  </span>
                </span>
                <StatusBadge
                  status={
                    r.status === "active"
                      ? "approved"
                      : r.status === "suspended"
                        ? "rejected"
                        : "closed"
                  }
                  label={STATUS[r.status] ?? r.status}
                />
              </button>
            ))}
            {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا طلاب مطابقون.</p>}
          </Card>
          <Pager page={page} count={list.data?.count ?? 0} onPage={setPage} />
        </div>
        <aside ref={panel} className="mt-6 scroll-mt-20 lg:sticky lg:top-20 lg:mt-0">
          {mode === "new" && id ? (
            <StudentForm
              department={id}
              onCancel={() => setMode("view")}
              onSaved={(saved) => {
                setPicked(saved.public_id);
                setSearch(saved.full_name_ar);
                setStatus("");
                setLevel(undefined);
                setPage(1);
                setMode("view");
                refresh();
              }}
            />
          ) : s && mode === "edit" && id ? (
            <StudentForm
              department={id}
              student={s}
              onCancel={() => setMode("view")}
              onSaved={() => {
                setMode("view");
                refresh();
              }}
            />
          ) : s ? (
            <Card className="space-y-2 p-4 text-sm">
              <b className="block text-base text-text">{s.full_name_ar}</b>
              {s.full_name_en && (
                <p dir="ltr" className="text-end text-xs text-text-muted">
                  {s.full_name_en}
                </p>
              )}
              {[
                ["الرقم الجامعي", <bdi key="n">{s.university_number}</bdi>],
                ["البرنامج", s.program_name],
                ["المستوى", num(s.level)],
                ["الحالة", STATUS[s.status] ?? s.status],
                ["البريد", s.email ? <bdi key="e">{s.email}</bdi> : "—"],
                ["الهاتف", s.phone_e164 ? <bdi key="p">{s.phone_e164}</bdi> : "—"],
                ["الحساب", s.has_account ? "مفعّل" : "لم يسجّل بعد"],
              ].map(([k, v]) => (
                <p key={String(k)} className="flex justify-between gap-3">
                  <span className="text-text-muted">{k}</span>
                  <span className="font-medium">{v}</span>
                </p>
              ))}
              {(canManage || canDelete) && (
                <div className="flex flex-wrap gap-2 border-t border-border-soft pt-3">
                  {canManage && (
                    <Button
                      variant="secondary"
                      className="min-h-9 px-3"
                      onClick={() => open("edit")}
                    >
                      <Pencil size={15} aria-hidden />
                      تعديل
                    </Button>
                  )}
                  {canDelete && !s.has_account && (
                    <Button
                      variant="secondary"
                      className="min-h-9 px-3 text-danger-strong"
                      disabled={remove.isPending}
                      onClick={() =>
                        window.confirm(`حذف سجل «${s.full_name_ar}» نهائيًا؟`) &&
                        remove.mutate(s.public_id)
                      }
                    >
                      <Trash2 size={15} aria-hidden />
                      حذف
                    </Button>
                  )}
                </div>
              )}
              {remove.isError && <Notice>{problemMessage(remove.error)}</Notice>}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-text-muted">
              اختر طالبًا لعرض بياناته{canManage ? "، أو أضف طالبًا جديدًا." : "."}
            </Card>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}

/** Add a student to the department, or correct a record. A blank number is issued. */
function StudentForm({
  department,
  student,
  onCancel,
  onSaved,
}: {
  department: number;
  student?: Student;
  onCancel: () => void;
  onSaved: (saved: Student) => void;
}) {
  const programs = useQuery({
    queryKey: ["programs", department],
    queryFn: async () =>
      (await api.GET("/api/v1/programs", { params: { query: { ...ALL, department } as never } }))
        .data?.results ?? [],
  });
  const [f, setF] = useState({
    university_number: student?.university_number ?? "",
    full_name_ar: student?.full_name_ar ?? "",
    full_name_en: student?.full_name_en ?? "",
    program: student?.program ? String(student.program) : "",
    level: student?.level ?? 1,
    email: student?.email ?? "",
    phone_e164: student?.phone_e164 ?? "",
  });
  const program = (programs.data ?? []).find(
    (p) => String(p.id) === (f.program || String(programs.data?.[0]?.id ?? "")),
  );
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...f,
        program: Number(f.program || program?.id),
        full_name_en: f.full_name_en.trim(),
      };
      const { data, error } = student
        ? await api.PATCH("/api/v1/students/{public_id}", {
            params: { path: { public_id: student.public_id } },
            body: body as never,
          })
        : await api.POST("/api/v1/students", { body: body as never });
      if (!data) throw error;
      return data as Student;
    },
    onSuccess: onSaved,
  });
  const errors = (save.error as { errors?: Record<string, string[]> } | null)?.errors ?? {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const levels = program?.levels_count ?? 4;
  return (
    <form onSubmit={submit}>
      <p className="mb-2 text-sm font-semibold text-text">
        {student ? `تعديل سجل ${student.full_name_ar}` : "طالب جديد"}
      </p>
      <Card>
        <Field
          label="الاسم بالعربية"
          required
          value={f.full_name_ar}
          onChange={(e) => setF({ ...f, full_name_ar: e.target.value })}
          error={errors.full_name_ar?.[0]}
        />
        <Field
          label="الاسم بالإنجليزية (اختياري)"
          dir="ltr"
          value={f.full_name_en}
          onChange={(e) => setF({ ...f, full_name_en: e.target.value })}
          error={errors.full_name_en?.[0]}
        />
        <label className="block border-b border-border-soft px-4 py-2.5">
          <span className="block text-xs text-text-muted">البرنامج</span>
          <select
            value={f.program || String(program?.id ?? "")}
            onChange={(e) => setF({ ...f, program: e.target.value })}
            className="mt-0.5 block min-h-9 w-full bg-transparent text-base text-text outline-none"
          >
            {(programs.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_ar}
              </option>
            ))}
          </select>
          {errors.program?.[0] && (
            <span className="mt-1 block text-xs text-danger-strong">{errors.program[0]}</span>
          )}
        </label>
        <label className="block border-b border-border-soft px-4 py-2.5">
          <span className="block text-xs text-text-muted">المستوى</span>
          <select
            value={f.level}
            onChange={(e) => setF({ ...f, level: Number(e.target.value) })}
            className="mt-0.5 block min-h-9 w-full bg-transparent text-base text-text outline-none"
          >
            {Array.from({ length: levels }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>
                المستوى {num(l)}
              </option>
            ))}
          </select>
          {errors.level?.[0] && (
            <span className="mt-1 block text-xs text-danger-strong">{errors.level[0]}</span>
          )}
        </label>
        <Field
          label="الرقم الجامعي"
          dir="ltr"
          value={f.university_number}
          placeholder={student ? undefined : "يُصدر تلقائيًا إن تُرك فارغًا"}
          disabled={student?.has_account}
          hint={student?.has_account ? "لا يتغير بعد تفعيل الطالب حسابه." : undefined}
          onChange={(e) => setF({ ...f, university_number: e.target.value })}
          error={errors.university_number?.[0]}
        />
        <Field
          label="البريد الإلكتروني (اختياري)"
          type="email"
          dir="ltr"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          error={errors.email?.[0]}
        />
        <Field
          label="الهاتف (اختياري)"
          type="tel"
          dir="ltr"
          value={f.phone_e164}
          onChange={(e) => setF({ ...f, phone_e164: e.target.value })}
          error={errors.phone_e164?.[0]}
        />
      </Card>
      {save.isError && !Object.keys(errors).length && (
        <div className="mt-2">
          <Notice>{problemMessage(save.error)}</Notice>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={!f.full_name_ar.trim() || save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : student ? "حفظ التعديل" : "إضافة الطالب"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
