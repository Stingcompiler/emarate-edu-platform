import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  SectionLabel,
  StatusBadge,
  TextArea,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { type QType, TYPE_LABEL } from "../../lib/exam";
import { count, N } from "../../lib/format";
import { useConfirm } from "../../components/Confirm";

type Question = Omit<Schemas["Question"], "choices"> & {
  choices?: { id?: number; text: string; is_correct?: boolean }[];
};
const local = (iso: string) =>
  new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

/**
 * Boards: TeacherExamNew + TeacherExamQuestions (phone), DesktopExamBuilder (desktop:
 * question list beside the editor). Correct answers never reach students.
 */
export function ExamEditor() {
  const unsaved = useUnsavedChanges();
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const creating = !id;
  const courses = useQuery({
    // Courses taught plus, for a department manager/supervisor, the department's courses.
    queryKey: ["me", "courses", "managed"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/me/courses", { params: { query: { managed: true } } })) ?? [],
    enabled: creating,
  });
  const exam = useQuery({
    queryKey: ["exams", id],
    enabled: !creating,
    queryFn: async () =>
      ok(await api.GET("/api/v1/exams/{public_id}", { params: { path: { public_id: id! } } })) ??
      null,
  });
  const questions = useQuery({
    queryKey: ["exams", id, "questions"],
    enabled: !creating,
    queryFn: async () =>
      (ok(
        await api.GET("/api/v1/exams/{public_id}/questions", {
          params: { path: { public_id: id! } },
        }),
      ) ?? []) as unknown as Question[],
  });
  const problems = useQuery({
    queryKey: ["exams", id, "problems"],
    enabled: !creating,
    queryFn: async () =>
      (
        ok(
          await api.GET("/api/v1/exams/{public_id}/problems", {
            params: { path: { public_id: id! } },
          }),
        ) as { problems?: string[] } | undefined
      )?.problems ?? [],
  });

  const soon = new Date(Date.now() + 86_400_000);
  const [form, setForm] = useState({
    offering: "",
    title: "",
    opens_at: local(soon.toISOString()),
    closes_at: local(new Date(soon.getTime() + 2 * 3_600_000).toISOString()),
    duration_minutes: 45,
    pass_marks: "0",
    max_attempts: 1,
    allow_backtrack: true,
    shuffle_questions: false,
    shuffle_choices: false,
    result_visibility: "immediate",
    show_answers: false,
  });
  useEffect(() => {
    const e = exam.data;
    if (e)
      setForm({
        offering: String(e.offering),
        title: e.title,
        opens_at: local(e.opens_at),
        closes_at: local(e.closes_at),
        duration_minutes: e.duration_minutes,
        pass_marks: String(e.pass_marks ?? 0),
        max_attempts: e.max_attempts ?? 1,
        allow_backtrack: e.allow_backtrack ?? true,
        shuffle_questions: e.shuffle_questions ?? false,
        shuffle_choices: e.shuffle_choices ?? false,
        result_visibility: e.result_visibility ?? "immediate",
        show_answers: e.show_answers ?? false,
      });
  }, [exam.data]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const refresh = () => client.invalidateQueries({ queryKey: ["exams", id] });
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        offering: Number(form.offering),
        opens_at: new Date(form.opens_at).toISOString(),
        closes_at: new Date(form.closes_at).toISOString(),
      } as never;
      const res = creating
        ? await api.POST("/api/v1/exams", { body })
        : await api.PATCH("/api/v1/exams/{public_id}", {
            params: { path: { public_id: id! } },
            body,
          });
      if (!res.data) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      unsaved.saved();
      if (creating) navigate(`/exams/${data.public_id}/edit`, { replace: true });
      else refresh();
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/exams/{public_id}/publish", {
        params: { path: { public_id: id! } },
      });
      if (!data) throw error;
    },
    onSuccess: refresh,
  });

  const e = exam.data;
  const editable = creating || e?.status === "draft" || e?.status === "published";
  const total = (questions.data ?? []).reduce((sum, q) => sum + Number(q.marks ?? 0), 0);

  return (
    <PortalShell
      title={creating ? "اختبار جديد" : (e?.title ?? "اختبار")}
      subtitle="الوقت من ساعة الخادم · النافذة والمدة منفصلتان"
      back={{ label: "الاختبارات", to: creating ? "/exams" : `/exams/${id}` }}
    >
      <div className="contents" onInput={unsaved.onInput}>
        <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-6">
          <section>
            <SectionLabel>الإعدادات</SectionLabel>
            <Card>
              {creating && (
                <label className="block border-b border-border-soft px-4 py-2.5">
                  <span className="block text-xs text-text-muted">المادة</span>
                  <select
                    className="mt-1 block min-h-10 w-full bg-transparent text-base text-text"
                    value={form.offering}
                    onChange={(ev) => set({ offering: ev.target.value })}
                  >
                    <option value="">اختر…</option>
                    {(courses.data ?? [])
                      .filter((c) => c.my_role !== "student")
                      .map((c) => (
                        <option key={c.offering_id} value={c.offering_id}>
                          {c.code} — {c.name_ar}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <Field
                label="اسم الاختبار"
                value={form.title}
                onChange={(ev) => set({ title: ev.target.value })}
                disabled={!editable}
              />
              <Field
                label="يفتح"
                type="datetime-local"
                value={form.opens_at}
                onChange={(ev) => set({ opens_at: ev.target.value })}
                disabled={!editable}
              />
              <Field
                label="يُغلق"
                type="datetime-local"
                value={form.closes_at}
                onChange={(ev) => set({ closes_at: ev.target.value })}
                disabled={!editable}
              />
              <Field
                label="مدة المحاولة (دقيقة)"
                type="number"
                min={1}
                value={form.duration_minutes}
                onChange={(ev) => set({ duration_minutes: Number(ev.target.value) })}
                disabled={!editable}
              />
              <Field
                label="درجة النجاح"
                inputMode="decimal"
                value={form.pass_marks}
                onChange={(ev) => set({ pass_marks: ev.target.value })}
                disabled={!editable}
                hint={creating ? undefined : `المجموع ${total.toLocaleString("ar-u-nu-latn")}`}
              />
              <Field
                label="المحاولات"
                type="number"
                min={1}
                value={form.max_attempts}
                onChange={(ev) => set({ max_attempts: Number(ev.target.value) })}
                disabled={!editable}
              />
            </Card>
            <Card className="mt-3 divide-y divide-border-soft">
              {(
                [
                  ["allow_backtrack", "الرجوع للسؤال السابق"],
                  ["shuffle_questions", "ترتيب الأسئلة عشوائي"],
                  ["shuffle_choices", "ترتيب الاختيارات عشوائي"],
                  ["show_answers", "عرض الإجابات الصحيحة بعد النتيجة"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-12 items-center justify-between px-4 text-sm text-text"
                >
                  {label}
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-primary)]"
                    checked={form[key]}
                    onChange={(ev) => set({ [key]: ev.target.checked })}
                    disabled={!editable}
                  />
                </label>
              ))}
            </Card>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["immediate", "فور الإرسال"],
                ["after_close", "بعد الإغلاق"],
                ["manual", "يدويًا"],
              ].map(([key, label]) => (
                <Chip
                  key={key}
                  active={form.result_visibility === key}
                  onClick={() => set({ result_visibility: key })}
                >
                  {label}
                </Chip>
              ))}
            </div>
            {save.isError && (
              <div className="mt-3">
                <Notice>{problemMessage(save.error)}</Notice>
              </div>
            )}
            <Button
              className="mt-4 w-full"
              variant={creating ? "primary" : "secondary"}
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.title || (creating && !form.offering) || !editable}
            >
              {creating ? "التالي: الأسئلة" : "حفظ الإعدادات"}
            </Button>
          </section>

          {creating && (
            // Desktop: the questions column is not empty while the exam is being created.
            <section className="mt-6 lg:mt-0">
              <SectionLabel>الأسئلة</SectionLabel>
              <Card className="space-y-3 p-5 text-sm leading-6 text-text-muted">
                <p>
                  بعد حفظ الإعدادات بزر «التالي: الأسئلة» تضيف الأسئلة هنا، ولكلٍّ درجته، ويظهر
                  مجموع الدرجات أولًا بأول.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
                    <li key={t} className="rounded-full bg-surface-alt px-3 py-1 text-xs text-text">
                      {TYPE_LABEL[t]}
                    </li>
                  ))}
                </ul>
                <p>يبقى الاختبار مسودة لا يراها الطلاب حتى تنشره.</p>
              </Card>
            </section>
          )}
          {!creating && e && (
            // Questions save one by one; typing here isn't unsaved exam settings.
            <section data-saves-itself className="mt-6 lg:mt-0">
              <div className="flex items-center justify-between">
                <SectionLabel>
                  الأسئلة · {(questions.data?.length ?? 0).toLocaleString("ar-u-nu-latn")} ·{" "}
                  {count(total, N.mark)}
                </SectionLabel>
                <StatusBadge
                  status={e.status}
                  label={
                    e.status === "draft" ? "مسودة" : e.status === "published" ? "منشور" : "مغلق"
                  }
                />
              </div>
              {(problems.data ?? []).length > 0 && (
                <Notice tone="warning">{problems.data!.join(" · ")}</Notice>
              )}
              <div className="mt-3 space-y-3">
                {(questions.data ?? []).map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    examId={id!}
                    question={q}
                    position={i + 1}
                    onChanged={refresh}
                    locked={e.status !== "draft"}
                  />
                ))}
                {e.status === "draft" && <NewQuestion examId={id!} onAdded={refresh} />}
              </div>
              {publish.isError && (
                <div className="mt-3">
                  <Notice>{problemMessage(publish.error)}</Notice>
                </div>
              )}
              {e.status === "draft" && (
                <Button
                  className="mt-4 w-full"
                  onClick={() => publish.mutate()}
                  disabled={publish.isPending || (problems.data ?? []).length > 0}
                >
                  جدولة ونشر
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

function QuestionCard({
  examId,
  question: q,
  position,
  onChanged,
  locked,
}: {
  examId: string;
  question: Question;
  position: number;
  onChanged: () => void;
  locked: boolean;
}) {
  const confirm = useConfirm();
  const remove = useMutation({
    mutationFn: async () => {
      await api.DELETE("/api/v1/exams/{public_id}/questions/{question_id}", {
        params: { path: { public_id: examId, question_id: String(q.id) } },
      });
    },
    onSuccess: onChanged,
  });
  const config = (q.config ?? {}) as { answer?: boolean; accepted?: string[] };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-alt text-sm font-bold text-text">
          {position.toLocaleString("ar-u-nu-latn")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-muted">
            {TYPE_LABEL[q.type as QType]} · {count(Number(q.marks ?? 0), N.mark)}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm font-semibold text-text">{q.text}</p>
          {q.choices && q.choices.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {q.choices.map((c, i) => (
                <li
                  key={c.id ?? i}
                  className={c.is_correct ? "font-semibold text-success-strong" : "text-text-muted"}
                >
                  {c.is_correct ? "✓ " : "○ "}
                  {c.text}
                </li>
              ))}
            </ul>
          )}
          {q.type === "true_false" && (
            <p className="mt-2 text-sm text-success-strong">✓ {config.answer ? "صح" : "خطأ"}</p>
          )}
          {q.type === "fill_blank" && (
            <p className="mt-2 text-sm text-text-muted">
              الإجابات المقبولة: {(config.accepted ?? []).join("، ")}
            </p>
          )}
        </div>
        {!locked && (
          <button
            type="button"
            onClick={async () =>
              (await confirm({ title: "حذف السؤال؟", confirm: "حذف السؤال" })) && remove.mutate()
            }
            aria-label="حذف السؤال"
            className="grid size-9 place-items-center rounded-lg text-danger-strong hover:bg-danger-soft"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        )}
      </div>
    </Card>
  );
}

function NewQuestion({ examId, onAdded }: { examId: string; onAdded: () => void }) {
  const [type, setType] = useState<QType>("single");
  const [text, setText] = useState("");
  const [marks, setMarks] = useState("1");
  const [choices, setChoices] = useState([
    { text: "", is_correct: true },
    { text: "", is_correct: false },
  ]);
  const [tf, setTf] = useState(true);
  const [accepted, setAccepted] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { type, text, marks };
      if (type === "single" || type === "multiple")
        body.choices = choices.filter((c) => c.text.trim());
      if (type === "multiple") body.config = { partial: true };
      if (type === "true_false") body.config = { answer: tf };
      if (type === "fill_blank")
        body.config = {
          accepted: accepted
            .split(/[،,]/)
            .map((a) => a.trim())
            .filter(Boolean),
        };
      const { data, error } = await api.POST("/api/v1/exams/{public_id}/questions", {
        params: { path: { public_id: examId } },
        body: body as never,
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setText("");
      setChoices([
        { text: "", is_correct: true },
        { text: "", is_correct: false },
      ]);
      onAdded();
    },
  });
  const pick = (i: number) =>
    setChoices((cs) =>
      cs.map((c, j) => ({
        ...c,
        is_correct: type === "single" ? i === j : i === j ? !c.is_correct : c.is_correct,
      })),
    );
  return (
    <Card className="border-dashed p-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>
            {TYPE_LABEL[t]}
          </Chip>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-border-soft">
        <TextArea
          label="نص السؤال (``` للكود)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Field
          label="الدرجة"
          inputMode="decimal"
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
        />
      </div>
      {(type === "single" || type === "multiple") && (
        <div className="mt-3 space-y-2">
          {choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={type === "single" ? "radio" : "checkbox"}
                name="correct"
                checked={c.is_correct}
                onChange={() => pick(i)}
                aria-label="إجابة صحيحة"
                className="size-5 accent-[var(--color-success)]"
              />
              <input
                value={c.text}
                onChange={(e) =>
                  setChoices((cs) =>
                    cs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                  )
                }
                placeholder={`الخيار ${i + 1}`}
                className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
              />
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => setChoices((cs) => [...cs, { text: "", is_correct: false }])}
          >
            <Plus size={16} aria-hidden />
            خيار
          </Button>
        </div>
      )}
      {type === "true_false" && (
        <div className="mt-3 flex gap-2">
          <Chip active={tf} onClick={() => setTf(true)}>
            الصحيح: صح
          </Chip>
          <Chip active={!tf} onClick={() => setTf(false)}>
            الصحيح: خطأ
          </Chip>
        </div>
      )}
      {type === "fill_blank" && (
        <input
          value={accepted}
          onChange={(e) => setAccepted(e.target.value)}
          placeholder="الإجابات المقبولة، مفصولة بفاصلة"
          className="mt-3 min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
        />
      )}
      {add.isError && (
        <div className="mt-3">
          <Notice>{problemMessage(add.error)}</Notice>
        </div>
      )}
      <Button
        className="mt-3 w-full"
        onClick={() => add.mutate()}
        disabled={!text.trim() || add.isPending}
      >
        <Plus size={16} aria-hidden />
        إضافة السؤال
      </Button>
    </Card>
  );
}
