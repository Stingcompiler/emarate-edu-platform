import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, Field, Notice, problemMessage } from "../../components/ui";
import { saveSession, type VisitorSession, visitorApi } from "../../lib/visitor";

/** Board: VisitorApplyVerify — email → 6-digit code → a 30-minute visitor session. */
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
        body: { email: email.trim(), code, name },
      });
      if (!data) throw error;
      const session = { ...data, email: email.trim().toLowerCase() } as VisitorSession;
      saveSession(session);
      return session;
    },
    onSuccess: onVerified,
  });
  return (
    <div className="space-y-4">
      <Card>
        {askName && !sent && (
          <Field
            label="الاسم الكامل"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        <Field
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          className="text-end"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sent}
          autoComplete="email"
        />
        {sent && (
          <Field
            label="رمز التحقق"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            className="text-center tracking-[0.5em]"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
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
        <Button
          className="w-full"
          onClick={() => verify.mutate()}
          disabled={code.length !== 6 || verify.isPending}
        >
          متابعة
        </Button>
      ) : (
        <Button
          className="w-full"
          onClick={() => send.mutate()}
          disabled={!email.includes("@") || send.isPending}
        >
          إرسال رمز التحقق
        </Button>
      )}
    </div>
  );
}
