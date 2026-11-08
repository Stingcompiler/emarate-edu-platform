import type { Schemas } from "@ecst/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { api, ok } from "../lib/api";
import { DEGREE, fromPlanSemester, planSemester, planSemesters } from "../lib/format";
import { ALL } from "./Pager";
import { Select } from "./Select";
import { Button, Card, Field, Notice, problemMessage } from "./ui";

type Student = Schemas["StudentRecord"];
type Program = Schemas["Program"];

/** A programme with its degree: a department's bachelor and master may share a name. A name
 * that already says it («بكالوريوس تقنية المعلومات») is shown as it is. */
const programLabel = (p: Program) => {
  const degree = DEGREE[p.degree] ?? p.degree;
  return p.name_ar.includes(degree) ? p.name_ar : `${p.name_ar} · ${degree}`;
};

/**
 * Add a student by hand, or correct a record. A blank number is issued.
 *
 * With ``department`` the form lists that department's programmes (the department pages);
 * without it, every programme under its department, and one must be picked (the college-wide
 * «سجل الطلاب»: the system admin, supervisor and head registrar — owner, 2026-11-08).
 */
export function StudentForm({
  department,
  student,
  heading = true,
  onCancel,
  onSaved,
}: {
  department?: number;
  /** Off where the page title already says it («طالب جديد»). */
  heading?: boolean;
  student?: Student;
  onCancel: () => void;
  onSaved: (saved: Student) => void;
}) {
  const collegeWide = department === undefined;
  const programs = useQuery({
    queryKey: ["programs", department ?? "all"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/programs", {
          params: { query: { ...ALL, ...(department ? { department } : {}) } as never },
        }),
      )?.results ?? [],
  });
  const [f, setF] = useState({
    university_number: student?.university_number ?? "",
    full_name_ar: student?.full_name_ar ?? "",
    full_name_en: student?.full_name_en ?? "",
    program: student?.program ? String(student.program) : "",
    level: student?.level ?? 1,
    semester: student?.semester ?? 1,
    email: student?.email ?? "",
    phone_e164: student?.phone_e164 ?? "",
  });
  const list = programs.data ?? [];
  // A department's form starts on its first programme; the college-wide one waits for a pick.
  const chosen = f.program || (collegeWide ? "" : String(list[0]?.id ?? ""));
  const program = list.find((p) => String(p.id) === chosen);
  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, program: Number(chosen), full_name_en: f.full_name_en.trim() };
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
  // The college-wide list groups the programmes under their departments.
  const groups = new Map<string, Program[]>();
  for (const p of list) {
    const key = collegeWide ? (p.department_name ?? "") : "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const option = (p: Program) => (
    <option key={p.id} value={p.id}>
      {programLabel(p)}
    </option>
  );
  return (
    <form onSubmit={submit}>
      {heading && (
        <p className="mb-2 text-sm font-semibold text-text">
          {student ? `تعديل سجل ${student.full_name_ar}` : "طالب جديد"}
        </p>
      )}
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
          <span className="block text-xs text-text-muted">البرنامج الدراسي</span>
          <Select
            value={chosen}
            required
            searchPlaceholder="ابحث باسم البرنامج أو القسم"
            onChange={(e) => setF({ ...f, program: e.target.value })}
            className="mt-0.5 block min-h-9 w-full bg-transparent text-base text-text outline-none"
          >
            {collegeWide && <option value="">اختر البرنامج</option>}
            {collegeWide
              ? [...groups].map(([name, items]) => (
                  <optgroup key={name} label={name}>
                    {items.map(option)}
                  </optgroup>
                ))
              : list.map(option)}
          </Select>
          {errors.program?.[0] && (
            <span className="mt-1 block text-xs text-danger-strong">{errors.program[0]}</span>
          )}
        </label>
        {/* One choice: the plan's semester (1–10) carries the level (owner, 2026-11-07). */}
        <label className="block border-b border-border-soft px-4 py-2.5">
          <span className="block text-xs text-text-muted">الفصل الدراسي</span>
          <Select
            value={planSemester(f.level, f.semester)}
            onChange={(e) => setF({ ...f, ...fromPlanSemester(Number(e.target.value)) })}
            className="mt-0.5 block min-h-9 w-full bg-transparent text-base text-text outline-none"
          >
            {planSemesters(levels).map((x) => (
              <option key={x.n} value={x.n}>
                {x.label}
              </option>
            ))}
          </Select>
          {(errors.level?.[0] || errors.semester?.[0]) && (
            <span className="mt-1 block text-xs text-danger-strong">
              {errors.level?.[0] ?? errors.semester?.[0]}
            </span>
          )}
        </label>
        <Field
          label="الرقم الجامعي"
          dir="ltr"
          value={f.university_number}
          placeholder={student ? undefined : "يُصدر تلقائيًا إن تُرك فارغًا"}
          aria-label={student ? undefined : "يُصدر تلقائيًا إن تُرك فارغًا"}
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
        <Button
          type="submit"
          disabled={!f.full_name_ar.trim() || !chosen || save.isPending}
          why={
            !f.full_name_ar.trim()
              ? "اكتب الاسم بالعربية"
              : !chosen
                ? "اختر البرنامج الدراسي"
                : undefined
          }
        >
          {save.isPending ? "جارٍ الحفظ…" : student ? "حفظ التعديل" : "إضافة الطالب"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
