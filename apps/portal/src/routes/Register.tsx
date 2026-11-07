import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";

import {
  AuthLayout,
  Button,
  Card,
  Field,
  Notice,
  problemMessage,
  PasswordField,
  TextArea,
} from "../components/ui";
import { api } from "../lib/api";
import { type Choice, ChoiceField } from "../components/ChoiceField";
import { OtpInput } from "../components/OtpInput";

type Step = "details" | "code" | "password" | "done" | "taken" | "reported";

/**
 * Student self-registration (docs/05 §8.1): record match → email code → password.
 * The match is the university number, the programme (picked from the list) and the name
 * (owner, 2026-11-07). A record that already has an account offers to report it.
 * No dedicated board: follows the Login and AuthReset boards in the auth card.
 */
export function Register() {
  const [step, setStep] = useState<Step>("details");
  const [requestId, setRequestId] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [program, setProgram] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "pending_approval">("active");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const programs = useQuery({
    queryKey: ["public", "programs"],
    queryFn: async () => (await api.GET("/api/public/programs")).data ?? [],
    staleTime: 5 * 60_000,
  });
  const choices: Choice[] = (programs.data ?? []).map((p) => ({
    value: p.code,
    label: p.name_ar,
    hint: p.name_en,
    group: p.department_name,
    badge: p.degree_label,
  }));

  useEffect(() => {
    document.title = "إنشاء حساب طالب — بوابة كلية الإمارات";
    void api.GET("/api/public/csrf");
  }, []);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError("");
    const failure = await action();
    setBusy(false);
    if (failure) setError(failure);
  }

  const details = () => ({
    university_number: number.trim(),
    full_name: name.trim(),
    program,
    email: email.trim(),
  });

  const start = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error } = await api.POST("/api/public/registration/start", {
        body: details(),
      });
      if ((error as { code?: string } | undefined)?.code === "already_registered") {
        setStep("taken");
        return null;
      }
      if (!data) return problemMessage(error);
      setRequestId(data.request_id);
      setStep("code");
      return null;
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error } = await api.POST("/api/public/registration/verify", {
        body: { request_id: requestId, code: code.trim() },
      });
      if (!data) return "الرمز غير صحيح أو انتهت صلاحيته.";
      void error;
      setStep("password");
      return null;
    });
  };

  const complete = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error } = await api.POST("/api/public/registration/complete", {
        body: { request_id: requestId, password },
      });
      if (!data) return problemMessage(error);
      setStatus(data.status);
      setStep("done");
      return null;
    });
  };

  const report = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error } = await api.POST("/api/public/registration/report", {
        body: { ...details(), note: note.trim() },
      });
      if (!data) return problemMessage(error);
      setStep("reported");
      return null;
    });
  };

  if (step === "reported") {
    return (
      <AuthLayout title="وصل بلاغك">
        <Notice tone="success">
          سيراجعه قسمك ويردّ عليك على <bdi>{email}</bdi>. قد يُطلب منك الحضور بإثبات هويتك. إن ثبت
          أن الحساب ليس لك يُوقف، وتنشئ حسابك من جديد.
        </Notice>
        <Link to="/login" className="mt-4 block">
          <Button variant="secondary" className="w-full">
            العودة إلى الدخول
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  if (step === "taken") {
    return (
      <AuthLayout
        title="هذا الرقم مسجَّل بحساب"
        subtitle={`الرقم الجامعي \u2066${number.trim()}\u2069`}
      >
        <form onSubmit={report} className="space-y-4">
          <Notice tone="warning">
            أُنشئ حساب على هذا الرقم من قبل. إن كنت أنشأته فادخل إليه أو استعد كلمة المرور. وإن لم
            تنشئه فأبلغ قسمك ليتحقق ويوقفه.
          </Notice>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/login">
              <Button variant="secondary" className="w-full">
                الدخول
              </Button>
            </Link>
            <Link to="/forgot-password">
              <Button variant="secondary" className="w-full">
                نسيت كلمة المرور
              </Button>
            </Link>
          </div>
          <Card>
            <Field
              label="بريدك للتواصل"
              type="email"
              dir="ltr"
              className="text-end"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <TextArea
              label="ملاحظة للقسم (اختياري)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="مثلًا: لم أنشئ حسابًا، وأظن زميلًا استخدم بياناتي."
            />
          </Card>
          {error && <Notice>{error}</Notice>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "لحظة…" : "ليس حسابي — أبلّغ عن انتحال"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("details");
            }}
            className="block w-full text-center text-sm text-text-muted"
          >
            رجوع لتعديل البيانات
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (step === "done") {
    return (
      <AuthLayout title={status === "active" ? "تم إنشاء حسابك" : "حسابك بانتظار الاعتماد"}>
        <Notice tone={status === "active" ? "success" : "info"}>
          {status === "active"
            ? "يمكنك الدخول الآن برقمك الجامعي أو بريدك."
            : "سيعتمد مدير قسمك الحساب قريبًا، وسنرسل لك بريدًا عند الاعتماد."}
        </Notice>
        <Link to="/login" className="mt-4 block">
          <Button className="w-full">الذهاب إلى الدخول</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="إنشاء حساب طالب"
      subtitle={
        step === "details"
          ? "لطلاب الكلية المقيدين: أدخل بياناتك كما في سجل الكلية"
          : step === "code"
            ? `أرسلنا رمزًا من 6 أرقام إلى ${email}`
            : "اختر كلمة مرور لحسابك"
      }
    >
      <form
        onSubmit={step === "details" ? start : step === "code" ? verify : complete}
        className="space-y-4"
      >
        <Card>
          {step === "details" && (
            <>
              <ChoiceField
                label="التخصص"
                value={program}
                onChange={setProgram}
                options={choices}
                loading={programs.isPending}
                placeholder="اختر تخصصك"
                searchPlaceholder="ابحث باسم التخصص أو القسم"
                empty="لا تخصص بهذا الاسم"
                required
                autoFocus
              />
              <Field
                label="الرقم الجامعي"
                dir="ltr"
                className="text-end"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
              />
              <Field
                label="الاسم الرباعي"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
              <Field
                label="البريد الإلكتروني"
                type="email"
                dir="ltr"
                className="text-end"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </>
          )}
          {step === "code" && (
            <OtpInput
              label="رمز التحقق"
              hint="6 أرقام وصلت إلى بريدك"
              value={code}
              onChange={setCode}
              required
              autoFocus
            />
          )}
          {step === "password" && (
            <PasswordField
              label="كلمة المرور"
              autoComplete="new-password"
              dir="ltr"
              hint="8 أحرف على الأقل، ولا تكون شائعة أو مطابقة لبريدك."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          )}
        </Card>
        {step === "details" && (
          <p className="px-1 text-xs leading-relaxed text-text-muted">
            نتحقق من الرقم الجامعي والتخصص والاسم كما في سجل الكلية، ثم يصلك رمز على البريد. استخدم
            بريد الكلية ليُفعَّل حسابك فورًا.
          </p>
        )}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "لحظة…" : step === "password" ? "إنشاء الحساب" : "متابعة"}
        </Button>
        <Link to="/login" className="block text-center text-sm text-text-muted">
          لديك حساب؟ الدخول
        </Link>
        {step === "details" && (
          <p className="border-t border-border-soft pt-4 text-center text-sm text-text-muted">
            تريد الالتحاق بالكلية؟{" "}
            <Link to="/apply" className="font-semibold text-primary">
              قدّم من هنا
            </Link>{" "}
            — بلا حساب.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
