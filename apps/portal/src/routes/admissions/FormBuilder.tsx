import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
  SideNote,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import type { Field, FormSchema } from "../../lib/visitor";

const TYPES: { key: Field["type"]; label: string }[] = [
  { key: "text", label: "نص قصير" },
  { key: "textarea", label: "نص طويل" },
  { key: "number", label: "رقم / نسبة" },
  { key: "date", label: "تاريخ" },
  { key: "select", label: "اختيار واحد" },
  { key: "multiselect", label: "اختيار متعدد" },
  { key: "boolean", label: "نعم / لا" },
  { key: "file", label: "رفع مستند" },
  { key: "note", label: "نص توضيحي" },
];

/** Board: DesktopFormBuilder (desktop). Phone derived: stacked. Fixed fields (name, email, phone, program) are built in. */
export function FormBuilder() {
  const me = useMe();
  const editor = can(me.data, "admissions.manage");
  const client = useQueryClient();
  const templates = useQuery({
    queryKey: ["admissions", "templates"],
    queryFn: async () => (await api.GET("/api/v1/form-templates")).data?.results ?? [],
  });
  const [picked, setPicked] = useState<number | null>(null);
  const template = templates.data?.find((t) => t.id === picked) ?? templates.data?.[0];
  const [fields, setFields] = useState<Field[]>([]);
  useEffect(() => {
    const schema = (template?.schema ?? {}) as FormSchema;
    setFields(
      (schema.steps ?? []).flatMap((s) => (s.sections ?? []).flatMap((sec) => sec.fields ?? [])),
    );
  }, [template]);
  const refresh = () => client.invalidateQueries({ queryKey: ["admissions", "templates"] });
  const schema = { steps: [{ title: "البيانات", sections: [{ title: "", fields }] }] };
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
  const set = (i: number, patch: Partial<Field>) =>
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) =>
    setFields((fs) => {
      const next = [...fs];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x!);
      return next;
    });
  return (
    <PortalShell
      title="قوالب التقديم"
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
      <Notice tone="info">
        الحقول الأساسية مقفلة في كل القوالب: الاسم الكامل، البريد (مع تحقق)، الهاتف، البرنامج. النشر
        يجمّد الإصدار، وأي تعديل بعده إصدار جديد.
      </Notice>
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
        <div className="space-y-3">
          {fields.map((f, i) => (
            <Card key={i} className="grid gap-2 p-3 sm:grid-cols-[1fr_140px_auto]">
              <input
                value={f.label}
                onChange={(e) => set(i, { label: e.target.value })}
                placeholder="العنوان الظاهر"
                disabled={!draft || !editor}
                className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
              />
              <input
                dir="ltr"
                value={f.key}
                onChange={(e) =>
                  set(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })
                }
                placeholder="key"
                disabled={!draft || !editor}
                className="min-h-10 rounded-lg border border-border bg-surface px-3 font-mono text-xs"
              />
              <span className="flex items-center gap-1">
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={!!f.required}
                    onChange={(e) => set(i, { required: e.target.checked })}
                    disabled={!draft || !editor}
                  />
                  إلزامي
                </label>
                <button
                  type="button"
                  aria-label="أعلى"
                  disabled={i === 0 || !draft}
                  onClick={() => move(i, -1)}
                  className="grid size-8 place-items-center disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label="أسفل"
                  disabled={i === fields.length - 1 || !draft}
                  onClick={() => move(i, 1)}
                  className="grid size-8 place-items-center disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  aria-label="حذف"
                  disabled={!draft || !editor}
                  onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
                  className="grid size-8 place-items-center text-danger-strong disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </span>
              <span className="text-xs text-text-muted sm:col-span-3">
                {TYPES.find((t) => t.key === f.type)?.label}
              </span>
              {(f.type === "select" || f.type === "multiselect") && (
                <input
                  value={(f.options ?? []).join("، ")}
                  onChange={(e) =>
                    set(i, {
                      options: e.target.value
                        .split(/[،,]/)
                        .map((o) => o.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="الخيارات مفصولة بفاصلة"
                  disabled={!draft || !editor}
                  className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm sm:col-span-3"
                />
              )}
            </Card>
          ))}
        </div>
        {draft && editor && (
          <aside className="mt-4 lg:mt-0">
            <SectionLabel>أضف حقلًا</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Chip
                  key={t.key}
                  onClick={() =>
                    setFields((fs) => [
                      ...fs,
                      {
                        key: `field_${fs.length + 1}`,
                        type: t.key,
                        label: t.label,
                        options:
                          t.key === "select" || t.key === "multiselect"
                            ? ["خيار 1", "خيار 2"]
                            : undefined,
                      },
                    ])
                  }
                >
                  {t.label}
                </Chip>
              ))}
            </div>
          </aside>
        )}
        {!(draft && editor) && (
          <aside className="mt-4 lg:mt-0">
            <SideNote title={draft ? "للاطلاع" : "إصدار منشور"}>
              {draft
                ? "يعدّل القوالب رئيس المسجلين."
                : "الإصدار المنشور مجمَّد حتى لا تتغير الطلبات المقدَّمة به. «إصدار جديد للتعديل» ينسخه مسودة تعدّلها ثم تنشرها."}
            </SideNote>
          </aside>
        )}
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
