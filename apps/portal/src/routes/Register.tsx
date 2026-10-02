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
} from "../components/ui";
import { api } from "../lib/api";
import { OtpInput } from "../components/OtpInput";

type Step = "details" | "code" | "password" | "done";

/**
 * Student self-registration (docs/05 §8.1): record match → email code → password.
 * No dedicated board: follows the Login and AuthReset boards in the auth card.
 */
export function Register() {
  const [step, setStep] = useState<Step>("details");
  const [requestId, setRequestId] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "pending_approval">("active");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  const start = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { data, error } = await api.POST("/api/public/registration/start", {
        body: { university_number: number.trim(), full_name: name.trim(), email: email.trim() },
      });
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
          ? "أدخل بياناتك كما في سجل الكلية"
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
              <Field
                label="الرقم الجامعي"
                dir="ltr"
                className="text-end"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
                autoFocus
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
            إن طابقت بياناتك سجل الكلية وصلك رمز على البريد. استخدم بريد الكلية ليُفعَّل حسابك
            فورًا.
          </p>
        )}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "لحظة…" : step === "password" ? "إنشاء الحساب" : "متابعة"}
        </Button>
        <Link to="/login" className="block text-center text-sm text-text-muted">
          لديك حساب؟ الدخول
        </Link>
      </form>
    </AuthLayout>
  );
}
