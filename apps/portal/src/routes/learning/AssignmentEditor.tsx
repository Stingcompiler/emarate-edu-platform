import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { useLectures, useCourse } from "../../lib/learning";

const EXTENSIONS = ["pdf", "docx", "xlsx", "pptx", "sql", "zip", "jpg", "png", "txt"];
type Types = "file" | "link" | "text";
type Late = "none" | "allow" | "penalty";

/** "2026-10-05T23:59" ⇄ ISO, in the browser's timezone. */
const toLocal = (iso?: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

/** Board: TeacherAssignmentNew (phone, 4 steps); desktop derived — the four steps as sections of one form. */
export function AssignmentEditor() {
  const unsaved = useUnsavedChanges();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const existing = useQuery({
    queryKey: ["assignment", id],
    enabled: !!id,
    queryFn: async () =>
      (await api.GET("/api/v1/assignments/{public_id}", { params: { path: { public_id: id! } } }))
        .data ?? null,
  });
  const a = existing.data;
  const offering = a?.offering ?? Number(params.get("offering"));
  const course = useCourse(offering).data;
  const lectures = useLectures(offering);
  const [f, setF] = useState({
    title: "",
    description: "",
    lecture: "",
    opens_at: "",
    due_at: "",
    max_grade: "10",
    types: ["file"] as Types[],
    extensions: ["pdf"] as string[],
    max_files: 2,
    max_file_size_mb: 20,
    links: [] as { label: string; required: boolean }[],
    resubmit: true,
    late: "none" as Late,
    penalty: 10,
    late_until: "",
    grading: "manual" as "manual" | "rule",
  });
  useEffect(() => {
    if (a)
      setF({
        title: a.title,
        description: a.description ?? "",
        lecture: a.lecture ?? "",
        opens_at: toLocal(a.opens_at),
        due_at: toLocal(a.due_at),
        max_grade: String(Number(a.max_grade ?? 10)),
        types: (a.submission_types ?? []) as Types[],
        extensions: a.allowed_extensions ?? [],
        max_files: a.max_files ?? 2,
        max_file_size_mb: a.max_file_size_mb ?? 20,
        links: (a.link_fields ?? []).map((l) => ({ label: l.label, required: !!l.required })),
        resubmit: !!a.allow_resubmission,
        late: (a.late_policy as Late) ?? "none",
        penalty: a.late_penalty_percent ?? 10,
        late_until: toLocal(a.late_until),
        grading: (a.grading_mode as "manual" | "rule") ?? "manual",
      });
  }, [a]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const body = {
        offering,
        title: f.title,
        description: f.description,
        lecture: f.lecture || null,
        opens_at: toIso(f.opens_at),
        due_at: toIso(f.due_at)!,
        max_grade: f.max_grade,
        submission_types: f.types,
        allowed_extensions: f.types.includes("file") ? f.extensions : [],
        max_files: f.max_files,
        max_file_size_mb: f.max_file_size_mb,
        link_fields: f.types.includes("link") ? f.links.filter((l) => l.label.trim()) : [],
        allow_resubmission: f.resubmit,
        late_policy: f.late,
        late_penalty_percent: f.late === "penalty" ? f.penalty : 0,
        late_until: f.late === "none" ? null : toIso(f.late_until),
        grading_mode: f.grading,
        ...(f.grading === "rule" && !a?.rubric ? { rubric: { rules: [] } } : {}),
      };
      let publicId = id;
      if (!publicId) {
        const { data, error } = await api.POST("/api/v1/assignments", { body: body as never });
        if (!data) throw error;
        publicId = data.public_id;
      } else {
        const { data, error } = await api.PATCH("/api/v1/assignments/{public_id}", {
          params: { path: { public_id: publicId } },
          body: body as never,
        });
        if (!data) throw error;
      }
      if (publish) {
        const { data, error } = await api.POST("/api/v1/assignments/{public_id}/publish", {
          params: { path: { public_id: publicId } },
        });
        if (!data) throw error;
      }
      return publicId;
    },
    onSuccess: (publicId) => {
      unsaved.saved();
      void client.invalidateQueries({ queryKey: ["assignments"] });
      void client.invalidateQueries({ queryKey: ["assignment", publicId] });
      navigate(`/assignments/${publicId}`);
    },
  });
  const input =
    "mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm font-normal";
  return (
    <PortalShell
      title={a ? `تعديل: ${a.title}` : "واجب جديد"}
      subtitle={course?.name_ar}
      back={{ label: course?.name_ar ?? "المادة", to: `/courses/${offering}` }}
    >
      <div className="contents" onInput={unsaved.onInput}>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className="space-y-3">
            <SectionLabel>1 · الأساسيات</SectionLabel>
            <Card className="space-y-3 p-4">
              <label className="block text-sm font-semibold">
                العنوان
                <input
                  value={f.title}
                  onChange={(e) => set("title", e.target.value)}
                  className={input}
                />
              </label>
              <label className="block text-sm font-semibold">
                التعليمات
                <textarea
                  value={f.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={`${input} min-h-28 py-2`}
                />
              </label>
              <label className="block text-sm font-semibold">
                مرتبط بمحاضرة
                <select
                  value={f.lecture}
                  onChange={(e) => set("lecture", e.target.value)}
                  className={input}
                >
                  <option value="">بلا</option>
                  {(lectures.data ?? []).map((l) => (
                    <option key={l.public_id} value={l.public_id}>
                      {l.title_ar}
                    </option>
                  ))}
                </select>
              </label>
            </Card>
            <SectionLabel>2 · المواعيد والدرجة</SectionLabel>
            <Card className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                يفتح (اختياري)
                <input
                  type="datetime-local"
                  value={f.opens_at}
                  onChange={(e) => set("opens_at", e.target.value)}
                  className={input}
                />
              </label>
              <label className="block text-sm font-semibold">
                آخر موعد
                <input
                  type="datetime-local"
                  value={f.due_at}
                  onChange={(e) => set("due_at", e.target.value)}
                  className={input}
                />
              </label>
              <label className="block text-sm font-semibold">
                الدرجة القصوى
                <input
                  inputMode="decimal"
                  value={f.max_grade}
                  onChange={(e) => set("max_grade", e.target.value)}
                  className={input}
                />
              </label>
            </Card>
          </section>
          <section className="space-y-3">
            <SectionLabel>3 · ماذا يسلّم الطالب؟</SectionLabel>
            <Card className="space-y-4 p-4 text-sm">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["file", "ملفات"],
                    ["link", "روابط مسماة"],
                    ["text", "إجابة نصية"],
                  ] as [Types, string][]
                ).map(([k, l]) => (
                  <Chip
                    key={k}
                    active={f.types.includes(k)}
                    onClick={() => set("types", toggle(f.types, k))}
                  >
                    {l}
                  </Chip>
                ))}
              </div>
              {f.types.includes("file") && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {EXTENSIONS.map((x) => (
                      <Chip
                        key={x}
                        active={f.extensions.includes(x)}
                        onClick={() => set("extensions", toggle(f.extensions, x))}
                      >
                        {x.toUpperCase()}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                      حتى
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={f.max_files}
                        onChange={(e) => set("max_files", Number(e.target.value))}
                        className="w-16 rounded border border-border px-2 py-1"
                      />
                      ملفات
                    </label>
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                      الحجم
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={f.max_file_size_mb}
                        onChange={(e) => set("max_file_size_mb", Number(e.target.value))}
                        className="w-16 rounded border border-border px-2 py-1"
                      />
                      <bdi>MB</bdi>
                    </label>
                  </div>
                </div>
              )}
              {f.types.includes("link") && (
                <div className="space-y-2">
                  {f.links.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={l.label}
                        onChange={(e) =>
                          set(
                            "links",
                            f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          )
                        }
                        placeholder="مثال: GitHub Repository"
                        className="min-h-9 flex-1 rounded-lg border border-border px-2"
                      />
                      <Chip
                        active={l.required}
                        onClick={() =>
                          set(
                            "links",
                            f.links.map((x, j) => (j === i ? { ...x, required: !x.required } : x)),
                          )
                        }
                      >
                        {l.required ? "إلزامي" : "اختياري"}
                      </Chip>
                      <button
                        type="button"
                        aria-label="حذف"
                        onClick={() =>
                          set(
                            "links",
                            f.links.filter((_, j) => j !== i),
                          )
                        }
                        className="text-danger-strong"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => set("links", [...f.links, { label: "", required: true }])}
                    className="text-sm font-semibold text-primary"
                  >
                    + إضافة حقل رابط
                  </button>
                </div>
              )}
            </Card>
            <SectionLabel>4 · إعادة التسليم والتأخير والتصحيح</SectionLabel>
            <Card className="space-y-3 p-4 text-sm">
              <label className="flex items-center justify-between">
                إعادة التسليم حتى الموعد
                <input
                  type="checkbox"
                  checked={f.resubmit}
                  onChange={(e) => set("resubmit", e.target.checked)}
                />
              </label>
              <div>
                <p className="mb-2 text-xs text-text-muted">التسليم المتأخر</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["none", "غير مسموح"],
                      ["penalty", "بخصم"],
                      ["allow", "مسموح بلا خصم"],
                    ] as [Late, string][]
                  ).map(([k, l]) => (
                    <Chip key={k} active={f.late === k} onClick={() => set("late", k)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </div>
              {f.late === "penalty" && (
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  نسبة الخصم
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={f.penalty}
                    onChange={(e) => set("penalty", Number(e.target.value))}
                    className="w-16 rounded border border-border px-2 py-1"
                  />
                  ٪
                </label>
              )}
              {f.late !== "none" && (
                <label className="block text-xs text-text-muted">
                  آخر موعد للمتأخر
                  <input
                    type="datetime-local"
                    value={f.late_until}
                    onChange={(e) => set("late_until", e.target.value)}
                    className={input}
                  />
                </label>
              )}
              <div>
                <p className="mb-2 text-xs text-text-muted">التصحيح</p>
                <div className="flex gap-2">
                  <Chip active={f.grading === "manual"} onClick={() => set("grading", "manual")}>
                    يدوي
                  </Chip>
                  <Chip active={f.grading === "rule"} onClick={() => set("grading", "rule")}>
                    قواعد + اعتماد
                  </Chip>
                </div>
                {f.grading === "rule" && (
                  <p className="mt-2 text-xs text-text-muted">
                    القواعد تقترح درجة وأنت تعتمدها؛ الطالب لا يرى إلا المعتمد.
                  </p>
                )}
              </div>
            </Card>
          </section>
        </div>
        {save.isError && (
          <div className="mt-4">
            <Notice>{problemMessage(save.error)}</Notice>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {a && (
            <StatusBadge
              status={a.status}
              label={a.status === "draft" ? "مسودة" : a.status === "closed" ? "مغلق" : "منشور"}
            />
          )}
          <Button
            variant="secondary"
            disabled={!f.title.trim() || !f.due_at || save.isPending}
            onClick={() => save.mutate(false)}
          >
            حفظ كمسودة
          </Button>
          {(!a || a.status === "draft") && (
            <Button
              disabled={!f.title.trim() || !f.due_at || !f.types.length || save.isPending}
              onClick={() => save.mutate(true)}
            >
              نشر للطلاب
            </Button>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
