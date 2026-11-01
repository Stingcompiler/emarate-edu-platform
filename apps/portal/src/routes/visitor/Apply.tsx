import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Copy, FileUp, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  SectionLabel,
  problemMessage,
  CodeTile,
} from "../../components/ui";
import { useConfirm } from "../../components/Confirm";
import { SuccessMark } from "../../components/motion";
import { formData, postWithProgress } from "../../lib/upload";
import { type Upload as UploadItem, UploadStatus } from "../../components/UploadStatus";
import {
  conditionText,
  type Field as FormField,
  fieldsOf,
  type FormSchema,
  sectionsOf,
  shown,
  maskEmail,
  readSession,
  type VisitorSession,
  visitorApi,
  visitorAuth,
} from "../../lib/visitor";
import { VerifyEmail } from "./VerifyEmail";
import { isNetworkError, useOnline } from "../../lib/online";
import { markSynced, readDraft, writeDraft } from "../../lib/localDraft";
import { VisitorLayout } from "./VisitorLayout";
import { fmtDate } from "../../lib/format";

type Application = {
  public_id: string;
  reference_no: string;
  program_name: string;
  academic_year?: string;
  full_name: string;
  email: string;
  phone_e164: string;
  answers: Record<string, unknown>;
  status: string;
  form: { schema: FormSchema } | null;
  required_documents: { key: string; label: string; required?: boolean }[];
  documents: { public_id: string; doc_type: string; name: string; size: number }[];
  submitted_at: string | null;
};
const STEPS = [
  "التحقق من البريد",
  "اختيار البرنامج",
  "المؤهل والبيانات",
  "المستندات",
  "المراجعة والإرسال",
];

/** Boards: VisitorApplyVerify → Program → Apply → Docs → Review → Success (phone); desktop: the form beside the steps and help (VisitorLayout, 2026-10-30). */
export function Apply() {
  const [params, setParams] = useSearchParams();
  const [session, setSession] = useState<VisitorSession | null>(readSession);
  const [step, setStep] = useState(session ? 2 : 1);
  const appId = params.get("app");
  const client = useQueryClient();

  useEffect(() => {
    document.title = "التقديم — كلية الإمارات";
  }, []);
  // Opening a link with ?app= resumes at the form; while the visitor is changing programme
  // the old ?app= is still in the URL for a render, so it must not pull them back.
  const changingProgram = useRef(false);
  useEffect(() => {
    if (!appId) changingProgram.current = false;
    else if (session && step < 3 && !changingProgram.current) setStep(3);
  }, [appId, session, step]);

  const application = useQuery({
    queryKey: ["visitor", "application", appId],
    enabled: !!appId && !!session,
    queryFn: async () =>
      (
        await visitorApi.GET("/api/visitor/applications/{public_id}", {
          params: { path: { public_id: appId! } },
        })
      ).data as unknown as Application,
  });
  const app = application.data;
  // What the server found missing at submission, shown beside each field (spec §6).
  const [problems, setProblems] = useState<Record<string, string>>({});
  const refresh = () => client.invalidateQueries({ queryKey: ["visitor", "application", appId] });

  if (app && app.status !== "draft" && app.status !== "missing_documents")
    return <Success app={app} />;

  return (
    <VisitorLayout
      title={STEPS[step - 1]!}
      step={`الخطوة ${step} من 5`}
      progress={{ value: step, max: 5 }}
      steps={{ labels: STEPS, current: step }}
    >
      {session && step > 1 && (
        <p className="mb-4 text-xs text-text-muted">
          ✓ البريد مُتحقق: <span dir="ltr">{maskEmail(session.email)}</span>
        </p>
      )}
      {step === 1 && (
        <VerifyEmail
          askName
          onVerified={(s) => {
            setSession(s);
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <ChooseProgram
          preferred={params.get("program")}
          onStarted={(id) => {
            setParams({ app: id });
            setStep(3);
          }}
        />
      )}
      {step === 3 && app && (
        <FormStep
          app={app}
          problems={problems}
          onNext={async () => {
            await refresh();
            setStep(4);
          }}
          onChangeProgram={() => {
            changingProgram.current = true;
            setParams({});
            setStep(2);
          }}
        />
      )}
      {step === 4 && app && (
        <DocumentsStep
          app={app}
          onChanged={refresh}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}
      {step === 5 && app && (
        <ReviewStep
          app={app}
          onBack={() => setStep(3)}
          onSubmitted={refresh}
          onProblems={(found) => {
            setProblems(found);
            setStep(3);
          }}
        />
      )}
    </VisitorLayout>
  );
}

/** `preferred`: the programme code the visitor chose on the public site («قدّم لهذا البرنامج»);
 *  it is listed first and marked, and the visitor still confirms it with one tap. */
function ChooseProgram({
  onStarted,
  preferred,
}: {
  onStarted: (id: string) => void;
  preferred?: string | null;
}) {
  const [query, setQuery] = useState("");
  const intakes = useQuery({
    queryKey: ["public", "intakes"],
    queryFn: async () => (await visitorApi.GET("/api/public/intakes")).data ?? [],
  });
  const start = useMutation({
    mutationFn: async (intake: number) => {
      const { data, error } = await visitorApi.POST("/api/visitor/applications", {
        body: { intake },
      });
      if (!data) throw error;
      return data.public_id;
    },
    onSuccess: onStarted,
  });
  const rows = (intakes.data ?? [])
    .filter((i) => !query || `${i.program_name} ${i.department_name}`.includes(query))
    .sort((a, b) => Number(b.program_code === preferred) - Number(a.program_code === preferred));
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        برنامج واحد لكل طلب. يمكنك تقديم طلب آخر لبرنامج ثانٍ بنفس البريد.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث عن برنامج"
        aria-label="ابحث عن برنامج"
        className="min-h-11 w-full rounded-lg border border-border bg-surface px-3"
      />
      {start.isError && <Notice>{problemMessage(start.error)}</Notice>}
      <Card className="divide-y divide-border-soft">
        {rows.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => start.mutate(i.id)}
            disabled={start.isPending}
            className={`flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt ${
              i.program_code === preferred ? "bg-primary-soft/50" : ""
            }`}
          >
            <CodeTile top={i.program_code} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">{i.program_name}</span>
              {i.program_code === preferred && (
                <span className="block text-xs font-semibold text-primary">
                  البرنامج الذي اخترته من الموقع — اضغط للمتابعة
                </span>
              )}
              <span className="text-xs text-text-muted">
                {i.department_name} · {i.degree} · يُغلق {fmtDate(i.closes_at)}
              </span>
            </span>
          </button>
        ))}
        {!rows.length && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">
            لا برامج مفتوحة للتقديم الآن.
          </p>
        )}
      </Card>
    </div>
  );
}

/** The server's words for a field's problem, in Arabic. */
const PROBLEM: Record<string, string> = {
  "Required.": "هذا الحقل مطلوب.",
  "Upload this document.": "ارفع هذا المستند.",
  "Must be text.": "أدخل نصًا.",
  "Must be a number.": "أدخل رقمًا.",
  "Must be a year.": "اختر سنة صحيحة.",
  "Must be an amount.": "أدخل مبلغًا صحيحًا.",
  "Must be a date (YYYY-MM-DD).": "أدخل تاريخًا صحيحًا.",
  "Must be true or false.": "اختر نعم أو لا.",
  "Invalid phone number.": "رقم الهاتف غير صحيح — اكتبه مع مفتاح الدولة.",
  "Invalid email.": "البريد غير صحيح.",
  "Out of range.": "القيمة خارج الحدود المسموحة.",
  "Choose one of the options.": "اختر من الخيارات.",
  "Choose from the options.": "اختر من الخيارات.",
  "Invalid format.": "الصيغة غير صحيحة.",
};
export const problemText = (message: string) => PROBLEM[message] ?? message;

const INPUT =
  "mt-1.5 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary focus:ring-2 focus:ring-[var(--focus-ring)] aria-invalid:border-danger";

/** One field: a bold label above the input (spec §6), «تعليمات» opening the registrar's
 *  explanation and example, the error under it. Every input is tied to its label. */
export function FieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = `f-${field.key}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const hasHelp = !!(field.help || field.example);
  const described = [open && hasHelp ? helpId : "", error ? errorId : ""].filter(Boolean).join(" ");
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described || undefined,
    "aria-required": field.required || undefined,
  };
  if (field.type === "note")
    return (
      <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info-strong">{field.label}</p>
    );
  const label = (
    <span className="text-sm font-bold text-text">
      {field.label}
      {field.required && (
        <>
          <span aria-hidden className="ms-0.5 text-danger-strong">
            *
          </span>
          <span className="sr-only"> (مطلوب)</span>
        </>
      )}
    </span>
  );
  const head = (
    <div className="flex items-start justify-between gap-2">
      {field.type === "multiselect" ? (
        <span id={`${id}-label`}>{label}</span>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      {hasHelp && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={helpId}
          onClick={() => setOpen((o) => !o)}
          className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-xs font-semibold text-primary"
        >
          <Info size={14} aria-hidden />
          تعليمات
          <span className="sr-only"> الحقل: {field.label}</span>
        </button>
      )}
    </div>
  );
  const help = hasHelp && (
    <div
      id={helpId}
      hidden={!open}
      className="mt-1 rounded-lg bg-info-soft px-3 py-2 text-xs leading-6 text-info-strong"
    >
      {field.help}
      {field.example && (
        <span className="block">
          مثال: <bdi>{field.example}</bdi>
        </span>
      )}
    </div>
  );
  let input;
  if (field.type === "select") {
    input = (
      <select
        {...common}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      >
        <option value="">اختر…</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "year") {
    const now = new Date().getFullYear();
    input = (
      <select
        {...common}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
        className={INPUT}
      >
        <option value="">اختر السنة…</option>
        {Array.from({ length: 61 }, (_, i) => now + 1 - i).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "multiselect") {
    const picked = (value as string[]) ?? [];
    input = (
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={described || undefined}
        className="mt-2 flex flex-wrap gap-2"
      >
        {(field.options ?? []).map((o) => (
          <Chip
            key={o}
            active={picked.includes(o)}
            onClick={() =>
              onChange(picked.includes(o) ? picked.filter((p) => p !== o) : [...picked, o])
            }
          >
            {o}
          </Chip>
        ))}
      </div>
    );
  } else if (field.type === "boolean" || field.type === "consent") {
    return (
      <div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            {...common}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
          />
          {label}
        </label>
        {help}
        {error && (
          <p id={errorId} className="mt-1 text-xs text-danger-strong">
            {problemText(error)}
          </p>
        )}
      </div>
    );
  } else if (field.type === "textarea") {
    input = (
      <textarea
        {...common}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} min-h-24 py-2`}
      />
    );
  } else {
    const numeric = field.type === "number" || field.type === "money";
    const type =
      field.type === "date"
        ? "date"
        : field.type === "email"
          ? "email"
          : field.type === "phone"
            ? "tel"
            : "text";
    input = (
      <input
        {...common}
        type={type}
        inputMode={numeric ? "decimal" : field.type === "phone" ? "tel" : undefined}
        dir={type === "email" || type === "tel" || numeric || field.ltr ? "ltr" : undefined}
        value={(value as string | number) ?? ""}
        placeholder={field.type === "phone" ? "+249…" : undefined}
        onChange={(e) =>
          onChange(
            numeric
              ? e.target.value === ""
                ? ""
                : Number.isNaN(Number(e.target.value))
                  ? e.target.value
                  : Number(e.target.value)
              : e.target.value,
          )
        }
        className={`${INPUT} ${type === "tel" || type === "email" || numeric ? "text-end" : ""}`}
      />
    );
  }
  return (
    <div>
      {head}
      {help}
      {input}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger-strong">
          {problemText(error)}
        </p>
      )}
    </div>
  );
}

/** «دليل تعبئة الاستمارة» (spec §7): every section and field the applicant fills, with the
 *  registrar's explanation and example — the same text «تعليمات» opens, from one source. */
export function FillingGuide({ schema }: { schema: FormSchema | null | undefined }) {
  return (
    <details className="group rounded-2xl border border-border-soft bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-bold text-primary">
        <BookOpen size={18} aria-hidden />
        دليل تعبئة الاستمارة
        <span className="ms-auto text-xs font-normal text-text-muted group-open:hidden">
          اضغط للعرض
        </span>
      </summary>
      <div className="space-y-4 border-t border-border-soft px-4 py-4 text-sm">
        <GuideSections schema={schema} />
        <Link to="/apply/guide" target="_blank" className="tap-44 font-semibold text-primary">
          الدليل كاملًا للطباعة أو حفظه PDF
        </Link>
      </div>
    </details>
  );
}

/** The guide's body (spec §7): the intro, then every section and field the applicant fills,
 *  the label in bold with the explanation, the example and any condition under it. One source
 *  for «تعليمات», the in-form guide and the printable page. */
export function GuideSections({
  schema,
  level = 3,
}: {
  schema: FormSchema | null | undefined;
  level?: 2 | 3;
}) {
  const all = fieldsOf(schema);
  const Heading = `h${level}` as const;
  return (
    <>
      {schema?.intro && <p className="leading-7 text-text">{schema.intro}</p>}
      {sectionsOf(schema).map((section, i) => (
        <section key={i} className="break-inside-avoid">
          {section.title && <Heading className="font-bold text-text">{section.title}</Heading>}
          {section.description && <p className="text-xs text-text-muted">{section.description}</p>}
          <dl className="mt-2 space-y-2">
            {(section.fields ?? [])
              .filter((f) => f.type !== "note")
              .map((f) => (
                <div key={f.key} className="break-inside-avoid">
                  <dt className="font-bold text-text">
                    {f.label}
                    {f.required && !f.show_if ? " *" : ""}
                  </dt>
                  <dd className="text-text-muted">
                    {f.help || "—"}
                    {f.example && (
                      <span className="block">
                        مثال: <bdi>{f.example}</bdi>
                      </span>
                    )}
                    {conditionText(f, all) && (
                      <span className="block text-xs">
                        {conditionText(f, all)}
                        {f.required ? "، ويكون مطلوبًا عندها" : ""}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
      <p className="text-xs text-text-muted">الحقول المعلَّمة بـ * مطلوبة.</p>
    </>
  );
}

type DraftValue = { fullName: string; phone: string; answers: Record<string, unknown> };
const draftClock = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" });

export function FormStep({
  app,
  problems = {},
  onNext,
  onChangeProgram,
}: {
  app: Application;
  problems?: Record<string, string>;
  onNext: () => void;
  onChangeProgram: () => void;
}) {
  const confirm = useConfirm();
  // Another programme means another form (its own template): the draft is withdrawn so it
  // does not count against the per-cycle limit, and the visitor starts the new one (review
  // 2026-10-04 UX10).
  const change = useMutation({
    mutationFn: async () => {
      const { data, error } = await visitorApi.POST(
        "/api/visitor/applications/{public_id}/withdraw",
        { params: { path: { public_id: app.public_id } } },
      );
      if (!data) throw error;
    },
    onSuccess: onChangeProgram,
  });
  // What was typed here and not yet confirmed by the server survives a lost connection, a
  // closed tab and a reload: it is kept on this device first (design review B1).
  const online = useOnline();
  const kept = useRef(readDraft<DraftValue>(app.public_id));
  const restored = kept.current?.pending ? kept.current.value : null;
  const [fullName, setFullName] = useState(restored?.fullName ?? app.full_name);
  const [phone, setPhone] = useState(restored?.phone ?? app.phone_e164);
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    restored?.answers ?? app.answers ?? {},
  );
  const schema = app.form?.schema;
  const keys = new Set(fieldsOf(schema).map((f) => f.key));
  // The college's form asks for the name and phone itself (full_name_ar, student_phone): then
  // the built-in two are not asked twice, and the application's own copies follow the answers.
  const ownName = keys.has("full_name_ar");
  const ownPhone = keys.has("student_phone");
  const name = ownName ? String(answers.full_name_ar ?? "") : fullName;
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const patch = async () => {
    // A field hidden by a condition sends nothing: an old answer is not kept as a live one.
    const live = Object.fromEntries(
      Object.entries(answers).filter(([key]) => {
        const field = fieldsOf(schema).find((f) => f.key === key);
        return !field || shown(field, answers);
      }),
    );
    const { data, error } = await visitorApi.PATCH("/api/visitor/applications/{public_id}", {
      params: { path: { public_id: app.public_id } },
      body: {
        full_name: name,
        phone_e164: ownPhone ? String(answers.student_phone ?? "") : phone,
        answers: live,
      },
    });
    if (!data) throw error;
  };
  const save = useMutation({ mutationFn: patch, onSuccess: onNext });
  // The page promises «the draft is saved automatically» (review 2026-10-04 UX1): a change is
  // saved 1.5 s after the last keystroke, the state is shown, and leaving with unsaved changes
  // asks first. The server checks completeness only at submission.
  const dirty = useRef(!!restored);
  const [draft, setDraft] = useState<"saved" | "saving" | "device" | "error" | null>(
    restored ? "device" : null,
  );
  const [draftAt, setDraftAt] = useState<Date | null>(null);
  const autosave = useMutation({
    mutationFn: patch,
    onMutate: () => setDraft("saving"),
    onSuccess: () => {
      dirty.current = false;
      markSynced(app.public_id);
      setDraft("saved");
      setDraftAt(new Date());
    },
    // No answer from the server: the draft stays on this device and is sent when it can be;
    // a refusal (anything else) is a real error.
    onError: (error) => setDraft(isNetworkError(error) ? "device" : "error"),
  });
  const { mutate: saveDraft } = autosave;
  // Every change is written to the device at once, then sent to the server a moment later (or
  // when the connection comes back).
  useEffect(() => {
    if (!dirty.current) return;
    writeDraft<DraftValue>(app.public_id, { fullName, phone, answers }, true);
    if (!online) {
      setDraft("device");
      return;
    }
    if (!name.trim()) return;
    const timer = window.setTimeout(() => saveDraft(), 1500);
    return () => window.clearTimeout(timer);
  }, [app.public_id, fullName, phone, answers, online, saveDraft, name]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const edited =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      dirty.current = true;
      set(value);
    };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>{app.program_name}</SectionLabel>
        <button
          type="button"
          disabled={change.isPending}
          onClick={async () =>
            (await confirm({
              title: "تغيير البرنامج؟",
              body: "لكل برنامج نموذجه؛ سيُسحب هذا الطلب وتبدأ طلبًا جديدًا للبرنامج الذي تختاره، وتعيد إدخال بياناته.",
              confirm: "سحب الطلب واختيار برنامج آخر",
              tone: "primary",
            })) && change.mutate()
          }
          className="tap-44 text-sm font-semibold text-primary hover:underline"
        >
          تغيير البرنامج
        </button>
      </div>
      {change.isError && <Notice>{problemMessage(change.error)}</Notice>}
      {(schema?.title || app.academic_year) && (
        <div>
          {schema?.title && <h2 className="text-lg font-bold text-text">{schema.title}</h2>}
          {app.academic_year && (
            <p className="text-sm text-text-muted">
              العام الدراسي <bdi>{app.academic_year}</bdi>
            </p>
          )}
        </div>
      )}
      <FillingGuide schema={schema} />
      {Object.keys(problems).length > cleared.size && (
        <Notice>أكمل الحقول المعلَّمة أدناه ثم أرسل الطلب.</Notice>
      )}
      {(!ownName || !ownPhone) && (
        <Card>
          {!ownName && (
            <Field
              label="الاسم الكامل *"
              value={fullName}
              onChange={(e) => edited(setFullName)(e.target.value)}
            />
          )}
          {!ownPhone && (
            <Field
              label="الهاتف"
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => edited(setPhone)(e.target.value)}
              placeholder="+249…"
            />
          )}
        </Card>
      )}
      {sectionsOf(schema).map((section, i) => {
        const items = (section.fields ?? []).filter((f) => f.type !== "file" && shown(f, answers));
        if (!items.length) return null;
        return (
          <Card key={i} className="p-4">
            {section.title && <h3 className="text-base font-bold text-text">{section.title}</h3>}
            {section.description && (
              <p className="mt-0.5 text-sm text-text-muted">{section.description}</p>
            )}
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {items.map((f) => (
                <div key={f.key} className={f.width === "half" ? "" : "lg:col-span-2"}>
                  <FieldInput
                    field={f}
                    value={answers[f.key]}
                    error={cleared.has(f.key) ? undefined : problems[f.key]}
                    onChange={(v) => {
                      dirty.current = true;
                      setCleared((c) => new Set(c).add(f.key));
                      setAnswers((a) => ({ ...a, [f.key]: v }));
                    }}
                  />
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      <p
        className={`text-xs ${
          draft === "device"
            ? "inline-block rounded-md border border-dashed border-pending bg-pending-soft px-2.5 py-1 text-pending-strong"
            : "text-text-muted"
        }`}
        role="status"
        aria-live="polite"
      >
        {draft === "saving"
          ? "جارٍ حفظ المسودة…"
          : draft === "device"
            ? "محفوظة على الجهاز · بانتظار الإرسال"
            : draft === "error"
              ? "تعذّر حفظ المسودة على الخادم — راجع الحقول؛ ما كتبته باقٍ على هذا الجهاز."
              : draft === "saved" && draftAt
                ? `محفوظة على الخادم ${draftClock.format(draftAt)}`
                : "تُحفظ المسودة تلقائيًا أثناء الكتابة."}
      </p>
      {save.isError && <Notice>{problemMessage(save.error)}</Notice>}
      <Button
        className="w-full"
        onClick={() => save.mutate()}
        disabled={!name.trim() || save.isPending || !online}
        why={
          !online
            ? "يحتاج اتصالًا بالإنترنت: يُحفظ ما كتبته على جهازك ويكتمل عند عودة الاتصال"
            : ownName
              ? "أدخل اسمك الكامل بالعربية للمتابعة"
              : "أدخل اسمك الكامل للمتابعة"
        }
      >
        التالي: المستندات
      </Button>
    </div>
  );
}

function DocumentsStep({
  app,
  onChanged,
  onBack,
  onNext,
}: {
  app: Application;
  onChanged: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fileFields = fieldsOf(app.form?.schema)
    .filter((f) => f.type === "file")
    .map((f) => ({
      key: f.key,
      label: f.label,
      required: f.required,
      accept: f.accept,
      max_mb: f.max_mb,
      help: f.help,
    }));
  const needed: {
    key: string;
    label: string;
    required?: boolean;
    accept?: string[];
    max_mb?: number;
    help?: string;
  }[] = [...app.required_documents, ...fileFields];
  // The document's upload as it goes, then its result, on its own row (owner, 2026-10-30).
  const [sent, setSent] = useState<{ key: string; upload: UploadItem; file: File } | null>(null);
  const upload = useMutation({
    mutationFn: async ({ key, file }: { key: string; file: File }) => {
      const show = (u: UploadItem) => setSent({ key, upload: u, file });
      show({ state: "uploading", name: file.name, progress: null });
      try {
        await postWithProgress(
          `/api/visitor/applications/${app.public_id}/documents`,
          formData({ doc_type: key, file }),
          (progress) => show({ state: "uploading", name: file.name, progress }),
          visitorAuth(),
        );
        show({ state: "done", name: file.name, message: "رُفع المستند بنجاح" });
      } catch (error) {
        show({ state: "error", name: file.name, message: problemMessage(error) });
        throw error;
      }
    },
    onSuccess: onChanged,
  });
  const online = useOnline();
  const have = new Map(app.documents.map((d) => [d.doc_type, d]));
  const missing = needed.filter((n) => n.required && !have.has(n.key)).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        صورة واضحة بالكاميرا تكفي؛ PDF أو JPG أو PNG حتى 10 MB. لا يراها إلا مسجل القسم.
      </p>
      <Card className="divide-y divide-border-soft">
        {needed.map((n) => {
          const doc = have.get(n.key);
          return (
            <div key={n.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-text">
                  {n.label}
                  {n.required ? " *" : ""}
                </span>
                {(n.help || n.accept || n.max_mb) && (
                  <span className="block text-xs text-text-muted">
                    {n.help}
                    {n.accept &&
                      ` · ${n.accept.map((a) => a.toUpperCase()).join(" أو ")}${
                        n.max_mb ? ` حتى ${n.max_mb} MB` : ""
                      }`}
                  </span>
                )}
                <span className="text-xs text-text-muted">
                  {doc
                    ? `${doc.name} · ${(doc.size / 1024).toFixed(0)} KB · مرفوع ✓`
                    : "لم يُرفع بعد"}
                </span>
              </span>
              <label
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm ${
                  online ? "cursor-pointer text-primary" : "cursor-not-allowed text-text-muted"
                }`}
              >
                <FileUp size={16} aria-hidden /> {doc ? "استبدال" : "رفع"}
                <input
                  type="file"
                  accept={(n.accept ?? ["pdf", "jpg", "jpeg", "png"]).map((a) => `.${a}`).join(",")}
                  // ui-allow: the offline note under the list says why uploads are off
                  disabled={!online}
                  className="sr-only"
                  onChange={(e) =>
                    e.target.files?.[0] && upload.mutate({ key: n.key, file: e.target.files[0] })
                  }
                />
              </label>
              {sent?.key === n.key && (
                <div className="basis-full">
                  <UploadStatus
                    upload={sent.upload}
                    onRetry={() => upload.mutate({ key: sent.key, file: sent.file })}
                    onDismiss={() => setSent(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
        {!needed.length && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">
            لا مستندات مطلوبة لهذا البرنامج.
          </p>
        )}
      </Card>
      {!online && (
        <p className="text-xs text-text-muted">
          رفع المستندات يحتاج اتصالًا بالإنترنت، وبياناتك محفوظة على جهازك حتى يعود.
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          رجوع
        </Button>
        <Button className="flex-1" onClick={onNext}>
          {missing ? `المراجعة (ينقص ${missing})` : "التالي: المراجعة"}
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  app,
  onBack,
  onSubmitted,
  onProblems,
}: {
  app: Application;
  onBack: () => void;
  onSubmitted: () => void;
  onProblems: (problems: Record<string, string>) => void;
}) {
  const schema = app.form?.schema;
  const answers = app.answers ?? {};
  const online = useOnline();
  const [key] = useState(() => crypto.randomUUID());
  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await visitorApi.POST(
        "/api/visitor/applications/{public_id}/submit",
        { params: { path: { public_id: app.public_id } }, headers: { "Idempotency-Key": key } },
      );
      if (!data) throw error;
    },
    onSuccess: onSubmitted,
    onError: (error) => {
      // Fields of the form go back to it, each with its own message (spec §6).
      const found = (error as { errors?: Record<string, string[]> } | null)?.errors ?? {};
      const formKeys = new Set(
        fieldsOf(schema)
          .filter((f) => f.type !== "file")
          .map((f) => f.key),
      );
      const mine = Object.fromEntries(
        Object.entries(found)
          .filter(([k]) => formKeys.has(k))
          .map(([k, v]) => [k, v[0] ?? "Required."]),
      );
      if (Object.keys(mine).length) onProblems(mine);
    },
  });
  const show = (v: unknown) =>
    Array.isArray(v)
      ? v.join("، ")
      : v === true
        ? "نعم"
        : v === false
          ? "لا"
          : v === undefined || v === null || v === ""
            ? "—"
            : String(v);
  const keys = new Set(fieldsOf(schema).map((f) => f.key));
  const basics: [string, string][] = [
    ...(keys.has("full_name_ar") ? [] : ([["الاسم", app.full_name]] as [string, string][])),
    ["البريد", app.email],
    ...(keys.has("student_phone")
      ? []
      : ([["الهاتف", app.phone_e164 || "—"]] as [string, string][])),
  ];
  const rows = (pairs: [string, string][]) =>
    pairs.map(([k, v]) => (
      <div key={k} className="flex justify-between gap-3 px-4 py-2.5">
        <span className="font-semibold text-text">{k}</span>
        <span className="text-end text-text" dir="auto">
          {v}
        </span>
      </div>
    ));
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        راجع بياناتك قبل الإرسال؛ «تعديل» يعيدك إلى الاستمارة.
      </p>
      <SectionLabel>البيانات الأساسية</SectionLabel>
      <Card className="divide-y divide-border-soft text-sm">
        {rows([
          ...(app.academic_year ? [["العام الدراسي", app.academic_year]] : []),
          ["البرنامج", app.program_name],
          ...basics,
        ] as [string, string][])}
      </Card>
      {sectionsOf(schema).map((section, i) => {
        const items = (section.fields ?? []).filter(
          (f) => f.type !== "file" && f.type !== "note" && shown(f, answers),
        );
        if (!items.length) return null;
        return (
          <div key={i}>
            <SectionLabel>{section.title || "البيانات"}</SectionLabel>
            <Card className="divide-y divide-border-soft text-sm">
              {rows(items.map((f) => [f.label, show(answers[f.key])]))}
            </Card>
          </div>
        );
      })}
      <SectionLabel>المستندات · {app.documents.length}</SectionLabel>
      <Card className="divide-y divide-border-soft text-sm">
        {app.documents.map((d) => (
          <p key={d.public_id} className="px-4 py-2.5 text-text">
            ✓ {d.name}
          </p>
        ))}
      </Card>
      {submit.isError && (
        <Notice>
          {problemText(problemMessage(submit.error, "أكمل الحقول والمستندات المطلوبة."))}
        </Notice>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          تعديل
        </Button>
        <Button
          className="flex-1"
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !online}
          why="إرسال الطلب يحتاج اتصالًا بالإنترنت"
        >
          {submit.isPending ? "جارٍ الإرسال…" : "إرسال الطلب"}
        </Button>
      </div>
    </div>
  );
}

function Success({ app }: { app: Application }) {
  const [copied, setCopied] = useState(false);
  return (
    <VisitorLayout title={`وصل طلبك، ${app.full_name.split(" ")[0]}`}>
      <Card className="p-5 text-center">
        {/* The applicant's big moment: the check draws itself, with a little confetti. */}
        <SuccessMark confetti />
        <p className="mt-3 text-sm text-text-muted">
          {app.program_name} · أرسلنا نسخة من الطلب إلى بريدك.
        </p>
        <p className="mt-4 text-xs text-text-muted">الرقم المرجعي — احتفظ به</p>
        <p className="mt-1 font-mono text-2xl font-bold text-text" dir="ltr">
          {app.reference_no}
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            void navigator.clipboard?.writeText(app.reference_no);
            setCopied(true);
          }}
        >
          <Copy size={16} aria-hidden />
          {copied ? "نُسخ" : "نسخ الرقم"}
        </Button>
      </Card>
      <ol className="mt-5 space-y-3 text-sm">
        {[
          "يراجع مسجل القسم الطلب، وقد يطلب مستندًا إضافيًا برسالة على البريد.",
          "تتابع الحالة بلا حساب من «متابعة طلبي» ببريدك ورمز تحقق.",
          "عند القبول يصلك رقمك الجامعي ورابط تفعيل حسابك.",
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">
              {(i + 1).toLocaleString("ar-u-nu-latn")}
            </span>
            <span className="text-text">{t}</span>
          </li>
        ))}
      </ol>
      <Link to="/track" className="mt-6 block">
        <Button className="w-full">متابعة طلبي</Button>
      </Link>
    </VisitorLayout>
  );
}
