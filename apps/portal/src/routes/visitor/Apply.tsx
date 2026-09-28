import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  SectionLabel,
  problemMessage,
} from "../../components/ui";
import { asForm, formData } from "../../lib/upload";
import {
  type Field as FormField,
  fieldsOf,
  type FormSchema,
  maskEmail,
  readSession,
  type VisitorSession,
  visitorApi,
} from "../../lib/visitor";
import { VerifyEmail } from "./VerifyEmail";
import { VisitorLayout } from "./VisitorLayout";

type Application = {
  public_id: string;
  reference_no: string;
  program_name: string;
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

/** Boards: VisitorApplyVerify → Program → Apply → Docs → Review → Success (phone); desktop: same steps in the 800px public column. */
export function Apply() {
  const [params, setParams] = useSearchParams();
  const [session, setSession] = useState<VisitorSession | null>(readSession);
  const [step, setStep] = useState(session ? 2 : 1);
  const appId = params.get("app");
  const client = useQueryClient();

  useEffect(() => {
    document.title = "التقديم — كلية الإمارات";
  }, []);
  useEffect(() => {
    if (appId && session && step < 3) setStep(3);
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
  const refresh = () => client.invalidateQueries({ queryKey: ["visitor", "application", appId] });

  if (app && app.status !== "draft" && app.status !== "missing_documents")
    return <Success app={app} />;

  return (
    <VisitorLayout title={STEPS[step - 1]!} step={`الخطوة ${step} من 5`}>
      <ol className="mb-5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              i + 1 === step
                ? "font-semibold text-primary"
                : i + 1 < step
                  ? "text-success-strong"
                  : ""
            }
          >
            {i + 1 < step ? "✓ " : `${i + 1}. `}
            {label}
          </li>
        ))}
      </ol>
      {session && step > 1 && (
        <p className="mb-4 text-xs text-text-muted">
          ✓ البريد مُتحقق: <span dir="ltr">{maskEmail(session.email)}</span> · المسودة تُحفظ
          تلقائيًا
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
          onNext={async () => {
            await refresh();
            setStep(4);
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
        <ReviewStep app={app} onBack={() => setStep(3)} onSubmitted={refresh} />
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
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-[11px] font-bold leading-tight text-primary-700">
              {i.program_code}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">{i.program_name}</span>
              {i.program_code === preferred && (
                <span className="block text-xs font-semibold text-primary">
                  البرنامج الذي اخترته من الموقع — اضغط للمتابعة
                </span>
              )}
              <span className="text-xs text-text-muted">
                {i.department_name} · {i.degree} · يُغلق{" "}
                {new Date(i.closes_at).toLocaleDateString("ar")}
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

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  if (field.type === "note")
    return <p className="px-4 py-3 text-sm text-text-muted">{field.label}</p>;
  if (field.type === "select") {
    return (
      <label className="block border-b border-border-soft px-4 py-2.5 last:border-b-0">
        <span className="block text-xs text-text-muted">{label}</span>
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block min-h-10 w-full bg-transparent text-base"
        >
          <option value="">اختر…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "multiselect") {
    const picked = (value as string[]) ?? [];
    return (
      <div className="border-b border-border-soft px-4 py-2.5 last:border-b-0">
        <span className="block text-xs text-text-muted">{label}</span>
        <div className="mt-2 flex flex-wrap gap-2">
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
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="flex min-h-12 items-center justify-between border-b border-border-soft px-4 last:border-b-0 text-sm">
        {label}
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="size-5 accent-[var(--color-primary)]"
        />
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block border-b border-border-soft px-4 py-2.5 last:border-b-0">
        <span className="block text-xs text-text-muted">{label}</span>
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block min-h-24 w-full bg-transparent"
        />
      </label>
    );
  }
  const type =
    field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "email"
          ? "email"
          : field.type === "phone"
            ? "tel"
            : "text";
  return (
    <Field
      label={label}
      type={type}
      value={(value as string | number) ?? ""}
      min={field.min}
      max={field.max}
      onChange={(e) =>
        onChange(
          field.type === "number"
            ? e.target.value === ""
              ? ""
              : Number(e.target.value)
            : e.target.value,
        )
      }
      hint={field.help}
      dir={type === "email" || type === "tel" ? "ltr" : undefined}
    />
  );
}

function FormStep({ app, onNext }: { app: Application; onNext: () => void }) {
  const [fullName, setFullName] = useState(app.full_name);
  const [phone, setPhone] = useState(app.phone_e164);
  const [answers, setAnswers] = useState<Record<string, unknown>>(app.answers ?? {});
  const fields = fieldsOf(app.form?.schema).filter((f) => f.type !== "file");
  const visible = (f: FormField) => !f.show_if || answers[f.show_if.key] === f.show_if.equals;
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await visitorApi.PATCH("/api/visitor/applications/{public_id}", {
        params: { path: { public_id: app.public_id } },
        body: { full_name: fullName, phone_e164: phone, answers },
      });
      if (!data) throw error;
    },
    onSuccess: onNext,
  });
  return (
    <div className="space-y-4">
      <SectionLabel>{app.program_name}</SectionLabel>
      <Card>
        <Field
          label="الاسم الكامل *"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Field
          label="الهاتف"
          type="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+249…"
        />
      </Card>
      {fields.length > 0 && (
        <Card>
          {fields.filter(visible).map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={answers[f.key]}
              onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))}
            />
          ))}
        </Card>
      )}
      {save.isError && <Notice>{problemMessage(save.error)}</Notice>}
      <Button
        className="w-full"
        onClick={() => save.mutate()}
        disabled={!fullName.trim() || save.isPending}
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
    .map((f) => ({ key: f.key, label: f.label, required: f.required }));
  const needed = [...app.required_documents, ...fileFields];
  const upload = useMutation({
    mutationFn: async ({ key, file }: { key: string; file: File }) => {
      const { data, error } = await visitorApi.POST(
        "/api/visitor/applications/{public_id}/documents",
        {
          params: { path: { public_id: app.public_id } },
          body: formData({ doc_type: key, file }) as never,
          ...asForm,
        },
      );
      if (!data) throw error;
    },
    onSuccess: onChanged,
  });
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
            <div key={n.key} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text">
                  {n.label}
                  {n.required ? " *" : ""}
                </span>
                <span className="text-xs text-text-muted">
                  {doc
                    ? `${doc.name} · ${(doc.size / 1024).toFixed(0)} KB · مرفوع ✓`
                    : "لم يُرفع بعد"}
                </span>
              </span>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-primary">
                <FileUp size={16} aria-hidden /> {doc ? "استبدال" : "رفع"}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="sr-only"
                  onChange={(e) =>
                    e.target.files?.[0] && upload.mutate({ key: n.key, file: e.target.files[0] })
                  }
                />
              </label>
            </div>
          );
        })}
        {!needed.length && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">
            لا مستندات مطلوبة لهذا البرنامج.
          </p>
        )}
      </Card>
      {upload.isPending && <Notice tone="info">جارٍ الرفع…</Notice>}
      {upload.isError && <Notice>{problemMessage(upload.error)}</Notice>}
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
}: {
  app: Application;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const fields = fieldsOf(app.form?.schema).filter((f) => f.type !== "file" && f.type !== "note");
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
  });
  const show = (v: unknown) =>
    Array.isArray(v)
      ? v.join("، ")
      : v === true
        ? "نعم"
        : v === false
          ? "لا"
          : v === undefined || v === ""
            ? "—"
            : String(v);
  return (
    <div className="space-y-4">
      <SectionLabel>البيانات</SectionLabel>
      <Card className="divide-y divide-border-soft text-sm">
        {[
          ["الاسم", app.full_name],
          ["البريد", app.email],
          ["الهاتف", app.phone_e164 || "—"],
          ...fields.map((f) => [f.label, show(app.answers?.[f.key])]),
        ].map(([k, v]) => (
          <div key={String(k)} className="flex justify-between gap-3 px-4 py-2.5">
            <span className="text-text-muted">{k}</span>
            <span className="text-end font-medium text-text" dir="auto">
              {v as string}
            </span>
          </div>
        ))}
      </Card>
      <SectionLabel>المستندات · {app.documents.length}</SectionLabel>
      <Card className="divide-y divide-border-soft text-sm">
        {app.documents.map((d) => (
          <p key={d.public_id} className="px-4 py-2.5 text-text">
            ✓ {d.name}
          </p>
        ))}
      </Card>
      {submit.isError && (
        <Notice>{problemMessage(submit.error, "أكمل الحقول والمستندات المطلوبة.")}</Notice>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          تعديل
        </Button>
        <Button className="flex-1" onClick={() => submit.mutate()} disabled={submit.isPending}>
          إرسال الطلب
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
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success-strong">
          <Check size={28} aria-hidden />
        </span>
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
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
              {(i + 1).toLocaleString("ar")}
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
