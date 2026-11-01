import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field as TextField,
  Notice,
  SectionLabel,
  SelectField,
  SideNote,
  StatusBadge,
  TextArea,
  problemMessage,
} from "../../components/ui";
import { ADMISSION_PRESET } from "../../lib/admissionPreset";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import {
  conditionText,
  type Field,
  type FormSchema,
  type Section,
  sectionsOf,
  shown,
} from "../../lib/visitor";
import { ALL } from "../../components/Pager";
import { FieldInput } from "../visitor/Apply";

const TYPES: { key: Field["type"]; label: string }[] = [
  { key: "text", label: "نص قصير" },
  { key: "textarea", label: "نص طويل" },
  { key: "number", label: "رقم / نسبة" },
  { key: "date", label: "تاريخ" },
  { key: "year", label: "سنة" },
  { key: "phone", label: "هاتف" },
  { key: "email", label: "بريد" },
  { key: "money", label: "مبلغ" },
  { key: "select", label: "اختيار واحد" },
  { key: "multiselect", label: "اختيار متعدد" },
  { key: "boolean", label: "نعم / لا" },
  { key: "consent", label: "مربع موافقة" },
  { key: "file", label: "رفع صورة أو مستند" },
  { key: "note", label: "نص توضيحي" },
];
const typeLabel = (type: Field["type"]) => TYPES.find((t) => t.key === type)?.label ?? type;

/** Who fills the field and who sees it (owner, 2026-11-01). */
const AUDIENCES: { key: NonNullable<Field["audience"]>; label: string; short: string }[] = [
  { key: "applicant", label: "يعبئه المتقدم", short: "للمتقدم" },
  { key: "release", label: "يعبئه الموظف ويظهر للمتقدم حين يتيحه", short: "يُتاح للمتقدم" },
  { key: "staff", label: "للموظفين فقط", short: "للموظفين" },
];
const audienceOf = (f: Field) => f.audience ?? "applicant";

/**
 * What the applicant sees, live (spec §5.2): their sections and fields only, drawn by the
 * form's own field component — try the conditions here before publishing.
 */
function ApplicantPreview({ schema }: { schema: FormSchema }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-text">معاينة كما يراها المتقدم</h2>
      {schema.title && <p className="mt-2 font-bold text-text">{schema.title}</p>}
      {schema.intro && <p className="mt-1 text-xs leading-6 text-text-muted">{schema.intro}</p>}
      <div className="mt-3 space-y-5">
        {sectionsOf(schema).map((section, i) => {
          const items = (section.fields ?? []).filter(
            (f) => audienceOf(f) === "applicant" && shown(f, answers),
          );
          if (!items.length) return null;
          return (
            <section key={i} className="space-y-3">
              {section.title && <h3 className="text-sm font-bold text-text">{section.title}</h3>}
              {items.map((f) =>
                f.type === "file" ? (
                  <div key={f.key}>
                    <p className="text-sm font-bold text-text">
                      {f.label}
                      {f.required ? " *" : ""}
                    </p>
                    <p className="mt-1 rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-text-muted">
                      يُرفع في خطوة المستندات
                    </p>
                  </div>
                ) : (
                  <FieldInput
                    key={f.key}
                    field={{ ...f, key: `preview_${f.key}` }}
                    value={answers[f.key]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))}
                  />
                ),
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function FieldEditor({
  field,
  all,
  locked,
  onChange,
}: {
  field: Field;
  all: Field[];
  locked: boolean;
  onChange: (patch: Partial<Field>) => void;
}) {
  const condition = conditionText(field, all);
  return (
    <div className="grid border-t border-border-soft sm:grid-cols-2">
      <TextField
        label="العنوان الظاهر"
        value={field.label}
        disabled={locked}
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <TextField
        label="المعرّف (بالإنجليزية، ثابت)"
        dir="ltr"
        value={field.key}
        disabled={locked}
        onChange={(e) =>
          onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
        }
      />
      <SelectField
        label="النوع"
        value={field.type}
        disabled={locked}
        onChange={(e) => onChange({ type: e.target.value as Field["type"] })}
      >
        {TYPES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="من يعبئه ومن يراه"
        value={audienceOf(field)}
        disabled={locked}
        onChange={(e) => onChange({ audience: e.target.value as Field["audience"] })}
      >
        {AUDIENCES.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="العرض على الكمبيوتر"
        value={field.width ?? "full"}
        disabled={locked}
        onChange={(e) => onChange({ width: e.target.value as Field["width"] })}
      >
        <option value="full">كامل الصف</option>
        <option value="half">نصف الصف</option>
      </SelectField>
      <label className="flex min-h-12 items-center gap-2 border-b border-border-soft px-4 text-sm">
        <input
          type="checkbox"
          checked={!!field.required}
          disabled={locked}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="size-5 accent-[var(--color-primary)]"
        />
        إلزامي
      </label>
      {(field.type === "select" || field.type === "multiselect") && (
        <div className="sm:col-span-2">
          <TextField
            label="الخيارات مفصولة بفاصلة"
            value={(field.options ?? []).join("، ")}
            disabled={locked}
            onChange={(e) =>
              onChange({
                options: e.target.value
                  .split(/[،,]/)
                  .map((o) => o.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}
      <div className="sm:col-span-2">
        <TextArea
          label="الشرح في التعليمات ودليل التعبئة"
          value={field.help ?? ""}
          disabled={locked}
          rows={2}
          onChange={(e) => onChange({ help: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <TextField
          label="مثال الإدخال (اختياري)"
          value={field.example ?? ""}
          disabled={locked}
          onChange={(e) => onChange({ example: e.target.value })}
        />
      </div>
      {condition && (
        <p className="px-4 py-2.5 text-xs text-text-muted sm:col-span-2">{condition}</p>
      )}
    </div>
  );
}

/** Board: DesktopFormBuilder (desktop). Phone derived: stacked. Name, email, phone and
 *  programme are built in unless the form asks for them itself (full_name_ar, student_phone). */
export function FormBuilder() {
  const me = useMe();
  const editor = can(me.data, "admissions.manage");
  const client = useQueryClient();
  const confirm = useConfirm();
  const templates = useQuery({
    queryKey: ["admissions", "templates"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/form-templates", { params: { query: ALL } }))?.results ?? [],
  });
  const [picked, setPicked] = useState<number | null>(null);
  const template = templates.data?.find((t) => t.id === picked) ?? templates.data?.[0];
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const load = (schema: FormSchema) => {
    setTitle(schema.title ?? "");
    setIntro(schema.intro ?? "");
    // Older templates kept every field in one untitled section; sections survive a save now.
    setSections(sectionsOf(schema).map((s) => ({ ...s, fields: [...(s.fields ?? [])] })));
  };
  useEffect(() => load((template?.schema ?? {}) as FormSchema), [template]);
  const refresh = () => client.invalidateQueries({ queryKey: ["admissions", "templates"] });
  const schema: FormSchema = {
    ...(title ? { title } : {}),
    ...(intro ? { intro } : {}),
    steps: [{ title: "الاستمارة", sections }],
  };
  const all = sections.flatMap((s) => s.fields ?? []);
  const save = useMutation({
    mutationFn: async () => {
      const res = template
        ? await api.PATCH("/api/v1/form-templates/{id}", {
            params: { path: { id: template.id } },
            body: { schema },
          })
        : await api.POST("/api/v1/form-templates", { body: { name: "default", schema } });
      if (!res.data) throw res.error;
    },
    onSuccess: refresh,
  });
  const act = useMutation({
    mutationFn: async (kind: "publish" | "new-version") => {
      // What is on screen is what gets published: the draft is saved first.
      if (kind === "publish") {
        const saved = await api.PATCH("/api/v1/form-templates/{id}", {
          params: { path: { id: template!.id } },
          body: { schema },
        });
        if (!saved.data) throw saved.error;
      }
      const res =
        kind === "publish"
          ? await api.POST("/api/v1/form-templates/{id}/publish", {
              params: { path: { id: template!.id } },
            })
          : await api.POST("/api/v1/form-templates/{id}/new-version", {
              params: { path: { id: template!.id } },
            });
      if (!res.data) throw res.error;
      return res.data.id;
    },
    onSuccess: (id) => {
      setPicked(id);
      void refresh();
    },
  });
  const draft = !template || template.status === "draft";
  const locked = !draft || !editor;
  const setSection = (si: number, patch: Partial<Section>) =>
    setSections((ss) => ss.map((s, j) => (j === si ? { ...s, ...patch } : s)));
  const setField = (si: number, fi: number, patch: Partial<Field>) =>
    setSections((ss) =>
      ss.map((s, j) =>
        j === si
          ? { ...s, fields: (s.fields ?? []).map((f, k) => (k === fi ? { ...f, ...patch } : f)) }
          : s,
      ),
    );
  const moveIn = <T,>(list: T[], i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    return next;
  };
  const addField = (si: number, type: Field["type"]) => {
    const key = `field_${all.length + 1}`;
    setSections((ss) =>
      ss.map((s, j) =>
        j === si
          ? {
              ...s,
              fields: [
                ...(s.fields ?? []),
                {
                  key,
                  type,
                  label: typeLabel(type),
                  options:
                    type === "select" || type === "multiselect" ? ["خيار 1", "خيار 2"] : undefined,
                },
              ],
            }
          : s,
      ),
    );
    setOpen(key);
  };
  return (
    <PortalShell
      title="استمارات التقديم"
      subtitle={template ? `${template.name} · الإصدار ${template.version}` : "لا قوالب بعد"}
    >
      <div className="flex flex-wrap items-center gap-2">
        {(templates.data ?? []).map((t) => (
          <Chip key={t.id} active={t.id === template?.id} onClick={() => setPicked(t.id)}>
            {t.name} v{t.version}
          </Chip>
        ))}
        {template && (
          <StatusBadge
            status={
              template.status === "published"
                ? "published"
                : template.status === "draft"
                  ? "draft"
                  : "closed"
            }
            label={
              template.status === "published"
                ? "منشور"
                : template.status === "draft"
                  ? "مسودة"
                  : "متقاعد"
            }
          />
        )}
      </div>
      <div className="mt-3">
        <Notice tone="info">
          البريد (مع تحقق) والبرنامج والعام الدراسي يأتي بها النظام. النشر يجمّد الإصدار، وأي تعديل
          بعده إصدار جديد لا يغيّر الطلبات المقدَّمة. الحقول «للموظفين» لا تظهر للمتقدم ولا في
          الدليل.
        </Notice>
      </div>
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="space-y-4">
          {!locked && (
            <Button
              variant="secondary"
              onClick={async () =>
                (!all.length ||
                  (await confirm({
                    title: "تحميل قالب طلب الالتحاق بالكلية؟",
                    body: "تُستبدل حقول هذه المسودة بحقول الاستمارة الورقية للكلية، وتبقى قابلة للتعديل قبل النشر.",
                    confirm: "تحميل القالب",
                    tone: "primary",
                  }))) &&
                load(ADMISSION_PRESET)
              }
            >
              تحميل قالب طلب الالتحاق بالكلية
            </Button>
          )}
          <div>
            <SectionLabel>رأس الاستمارة ودليلها</SectionLabel>
            <Card>
              <TextField
                label="عنوان الاستمارة"
                value={title}
                disabled={locked}
                placeholder="استمارة طلب الالتحاق بالكلية"
                onChange={(e) => setTitle(e.target.value)}
              />
              <TextArea
                label="المقدمة والتعليمات العامة (تظهر أعلى الاستمارة وفي الدليل)"
                value={intro}
                disabled={locked}
                rows={3}
                onChange={(e) => setIntro(e.target.value)}
              />
            </Card>
          </div>
          {sections.map((section, si) => (
            <div key={si}>
              <div className="mb-2 flex items-center gap-1">
                <SectionLabel>القسم {si + 1}</SectionLabel>
                {!locked && (
                  <span className="ms-auto flex">
                    <button
                      type="button"
                      aria-label={`نقل القسم ${si + 1} للأعلى`}
                      disabled={si === 0}
                      onClick={() => setSections((ss) => moveIn(ss, si, -1))}
                      className="grid size-11 place-items-center text-text-muted disabled:opacity-30"
                    >
                      <ArrowUp size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`نقل القسم ${si + 1} للأسفل`}
                      disabled={si === sections.length - 1}
                      onClick={() => setSections((ss) => moveIn(ss, si, 1))}
                      className="grid size-11 place-items-center text-text-muted disabled:opacity-30"
                    >
                      <ArrowDown size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`حذف القسم ${si + 1}`}
                      disabled={!!section.fields?.length}
                      title={section.fields?.length ? "انقل حقوله أو احذفها أولًا" : undefined}
                      onClick={() => setSections((ss) => ss.filter((_, j) => j !== si))}
                      className="grid size-11 place-items-center text-danger-strong disabled:opacity-30"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </span>
                )}
              </div>
              <Card>
                <TextField
                  label="عنوان القسم"
                  value={section.title ?? ""}
                  disabled={locked}
                  onChange={(e) => setSection(si, { title: e.target.value })}
                />
                <TextField
                  label="وصف القسم (اختياري)"
                  value={section.description ?? ""}
                  disabled={locked}
                  onChange={(e) => setSection(si, { description: e.target.value })}
                />
                {(section.fields ?? []).map((f, fi) => {
                  const expanded = open === f.key;
                  return (
                    <div
                      key={`${f.key}-${fi}`}
                      className="border-b border-border-soft last:border-b-0"
                    >
                      <div className="flex items-center gap-2 ps-4 pe-1">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setOpen(expanded ? null : f.key)}
                          className="min-h-12 min-w-0 flex-1 py-2 text-start"
                        >
                          <span className="block truncate text-sm font-bold text-text">
                            {f.label}
                            {f.required ? " *" : ""}
                          </span>
                          <span className="block text-xs text-text-muted">
                            {typeLabel(f.type)} ·{" "}
                            {AUDIENCES.find((a) => a.key === audienceOf(f))?.short}
                            {f.width === "half" ? " · نصف صف" : ""}
                            {f.show_if ? " · مشروط" : ""}
                          </span>
                        </button>
                        {!locked && (
                          <>
                            <button
                              type="button"
                              aria-label={`نقل «${f.label}» للأعلى`}
                              disabled={fi === 0}
                              onClick={() =>
                                setSection(si, { fields: moveIn(section.fields ?? [], fi, -1) })
                              }
                              className="grid size-11 place-items-center text-text-muted disabled:opacity-30"
                            >
                              <ArrowUp size={16} aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`نقل «${f.label}» للأسفل`}
                              disabled={fi === (section.fields ?? []).length - 1}
                              onClick={() =>
                                setSection(si, { fields: moveIn(section.fields ?? [], fi, 1) })
                              }
                              className="grid size-11 place-items-center text-text-muted disabled:opacity-30"
                            >
                              <ArrowDown size={16} aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`حذف «${f.label}»`}
                              onClick={() =>
                                setSection(si, {
                                  fields: (section.fields ?? []).filter((_, k) => k !== fi),
                                })
                              }
                              className="grid size-11 place-items-center text-danger-strong"
                            >
                              <Trash2 size={16} aria-hidden />
                            </button>
                          </>
                        )}
                      </div>
                      {expanded && (
                        <FieldEditor
                          field={f}
                          all={all}
                          locked={locked}
                          onChange={(patch) => setField(si, fi, patch)}
                        />
                      )}
                    </div>
                  );
                })}
                {!locked && (
                  <label className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm text-text-muted">
                    <Plus size={16} aria-hidden />
                    أضف حقلًا:
                    <select
                      value=""
                      onChange={(e) =>
                        e.target.value && addField(si, e.target.value as Field["type"])
                      }
                      className="min-h-11 rounded-lg border border-border bg-surface px-2 text-sm text-text"
                    >
                      <option value="">اختر النوع…</option>
                      {TYPES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </Card>
            </div>
          ))}
          {!locked && (
            <Button
              variant="secondary"
              onClick={() => setSections((ss) => [...ss, { title: "قسم جديد", fields: [] }])}
            >
              <Plus size={16} aria-hidden />
              إضافة قسم
            </Button>
          )}
        </div>
        <aside className="mt-4 space-y-4 lg:sticky lg:top-20 lg:mt-0">
          {locked && (
            <SideNote title={draft ? "للاطلاع" : "إصدار منشور"}>
              {draft
                ? "يعدّل القوالب رئيس المسجلين."
                : "الإصدار المنشور مجمَّد حتى لا تتغير الطلبات المقدَّمة به. «إصدار جديد للتعديل» ينسخه مسودة تعدّلها ثم تنشرها."}
            </SideNote>
          )}
          <ApplicantPreview schema={schema} />
        </aside>
      </div>
      {(save.isError || act.isError) && (
        <div className="mt-3">
          <Notice>{problemMessage(save.error ?? act.error)}</Notice>
        </div>
      )}
      {editor && (
        <div className="mt-5 flex flex-wrap gap-2">
          {draft ? (
            <>
              <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
                حفظ المسودة
              </Button>
              {template && (
                <Button onClick={() => act.mutate("publish")} disabled={act.isPending}>
                  نشر القالب
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => act.mutate("new-version")} disabled={act.isPending}>
              إصدار جديد للتعديل
            </Button>
          )}
        </div>
      )}
    </PortalShell>
  );
}
