import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

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

/** Boards: AuthForgot → AuthReset (phone); desktop uses the centred auth card. */
export function ForgotPassword() {
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "استعادة كلمة المرور — بوابة كلية الإمارات";
    void api.GET("/api/public/csrf");
  }, []);

  async function request(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    await api.POST("/api/public/password/forgot", { body: { email: email.trim() } });
    setBusy(false);
    setSent(true);
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await api.POST("/api/public/password/reset", {
      body: { email: email.trim(), code: code.trim(), new_password: password },
    });
    setBusy(false);
    if (!data) {
      setError(problemMessage(error, "الرمز غير صحيح أو انتهت صلاحيته."));
      return;
    }
    navigate("/login", { replace: true });
  }

  return (
    <AuthLayout
      title={sent ? "كلمة مرور جديدة" : "نسيت كلمة المرور"}
      subtitle={
        sent ? "إن كان البريد مسجلًا وصلك رمز من 6 أرقام." : "أدخل بريد حسابك وسنرسل لك رمزًا."
      }
    >
      <form onSubmit={sent ? reset : request} className="space-y-4">
        <Card>
          <Field
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            className="text-end"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={sent}
            autoComplete="email"
            autoFocus={!sent}
          />
          {sent && (
            <>
              <OtpInput
                label="الرمز"
                hint="6 أرقام وصلت إلى بريدك"
                value={code}
                onChange={setCode}
                required
                autoFocus
              />
              <PasswordField
                label="كلمة المرور الجديدة"
                autoComplete="new-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </>
          )}
        </Card>
        {sent && <Notice tone="info">بعد التغيير يُسجَّل خروجك من كل الأجهزة.</Notice>}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "لحظة…" : sent ? "حفظ كلمة المرور" : "إرسال الرمز"}
        </Button>
        <Link to="/login" className="block text-center text-sm text-text-muted">
          العودة إلى الدخول
        </Link>
      </form>
    </AuthLayout>
  );
}
