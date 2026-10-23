import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button, Card, Field, Notice, problemMessage } from "../../components/ui";
import { saveSession, type VisitorSession, visitorApi } from "../../lib/visitor";
import { OtpInput } from "../../components/OtpInput";

/** What is wrong with an email address, in words that say how to fix it; empty when fine. */
export function emailProblem(value: string): string {
  const email = value.trim();
  if (!email) return "أدخل بريدك الإلكتروني ليصلك رمز التحقق.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "صيغة البريد غير صحيحة. أدخل بريدًا مثل name@example.com.";
  }
  return "";
}

/**
 * Board: VisitorApplyVerify — email → 6-digit code → a 30-minute visitor session.
 * The first screen asks for one thing, the email (design review B3); the name is asked on the
 * code screen, after the visitor has seen the code arrive.
 */
export function VerifyEmail({
  onVerified,
  askName,
}: {
  onVerified: (s: VisitorSession) => void;
  askName?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  // A field says what is wrong once it has been left (or the button was pressed), never while
  // it is first being typed; the button stays pressable and shows the same message.
  const [emailTouched, setEmailTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const emailField = useRef<HTMLDivElement>(null);
  const emailError = emailTouched ? emailProblem(email) : "";
  const codeError = codeTouched && code.length !== 6 ? "أدخل الرمز المكوَّن من 6 أرقام." : "";
  const send = useMutation({
    mutationFn: async () => {
      const { response, error } = await visitorApi.POST("/api/public/visitor/otp", {
        body: { email: email.trim() },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => setSent(true),
  });
  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await visitorApi.POST("/api/public/visitor/verify", {
        body: { email: email.trim(), code, name: name.trim() },
      });
      if (!data) throw error;
      const session = { ...data, email: email.trim().toLowerCase() } as VisitorSession;
      saveSession(session);
      return session;
    },
    onSuccess: onVerified,
  });
  function submitEmail() {
    setEmailTouched(true);
    if (emailProblem(email)) {
      emailField.current?.querySelector("input")?.focus();
      return;
    }
    send.mutate();
  }
  function submitCode() {
    setCodeTouched(true);
    if (code.length === 6) verify.mutate();
  }
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (sent) submitCode();
        else submitEmail();
      }}
    >
      <Card>
        <div ref={emailField}>
          <Field
            label="البريد الإلكتروني"
            type="email"
            inputMode="email"
            dir="ltr"
            className="text-end"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            error={emailError}
            disabled={sent}
            autoComplete="email"
          />
        </div>
        {sent && (
          <OtpInput
            label="رمز التحقق"
            hint="6 أرقام وصلت إلى بريدك"
            value={code}
            onChange={setCode}
            error={codeError}
            autoFocus
          />
        )}
        {askName && sent && (
          <Field
            label="الاسم الكامل (اختياري)"
            hint="يظهر في طلبك ويمكنك تعديله في الخطوة التالية"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
      </Card>
      <Card className="p-4 text-sm leading-relaxed text-text-muted">
        <b className="text-text">لماذا التحقق؟</b> يثبت أن البريد لك حتى تتابع طلبك واستفساراتك
        لاحقًا بلا حساب أو كلمة مرور — نرسل إليه كل تحديث.
      </Card>
      {(send.isError || verify.isError) && (
        <Notice>
          {problemMessage(send.error ?? verify.error, "الرمز غير صحيح أو انتهت صلاحيته.")}
        </Notice>
      )}
      {sent ? (
        <Button type="submit" className="w-full" disabled={verify.isPending}>
          {verify.isPending ? "جارٍ التحقق…" : "متابعة"}
        </Button>
      ) : (
        <Button type="submit" className="w-full" disabled={send.isPending}>
          {send.isPending ? "جارٍ الإرسال…" : "إرسال رمز التحقق"}
        </Button>
      )}
    </form>
  );
}
