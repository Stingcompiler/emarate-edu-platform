import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { AuthLayout, Button, Card, Field, Notice } from "../components/ui";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";

/** Board: Login (phone). Desktop: the same form in the centred auth card (docs/06 §9). */
export function Login() {
  const me = useMe();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ tone: "danger" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    document.title = "تسجيل الدخول — بوابة كلية الإمارات";
    void api.GET("/api/public/csrf"); // sets the csrftoken cookie
  }, []);

  if (me.data) return <Navigate to={next} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, response } = await api.POST("/api/v1/auth/login", {
      body: { identifier: identifier.trim(), password },
    });
    setBusy(false);
    if (data) {
      client.setQueryData(["me"], data);
      navigate(next, { replace: true });
      return;
    }
    if (response.status === 403) {
      setError({
        tone: "warning",
        text: "حسابك بانتظار اعتماد مدير القسم. سنرسل لك بريدًا عند الاعتماد.",
      });
    } else if (response.status === 429) {
      setError({ tone: "danger", text: "محاولات كثيرة خاطئة. انتظر 15 دقيقة ثم أعد المحاولة." });
    } else {
      setError({ tone: "danger", text: "الرقم الجامعي أو البريد أو كلمة المرور غير صحيحة." });
    }
  }

  return (
    <AuthLayout title="مرحبًا بك في بوابة الكلية" subtitle="ادخل برقمك الجامعي أو بريدك">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card>
          <Field
            label="الرقم الجامعي أو البريد"
            name="username"
            autoComplete="username"
            dir="ltr"
            className="text-end"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoFocus
          />
          <Field
            label="كلمة المرور"
            type="password"
            name="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Card>
        <div className="flex items-center justify-between px-1 text-sm">
          <Link to="/register" className="font-semibold text-primary">
            طالب جديد؟ أنشئ حسابك
          </Link>
          <Link to="/forgot-password" className="text-text-muted">
            نسيت كلمة المرور
          </Link>
        </div>
        {error && <Notice tone={error.tone}>{error.text}</Notice>}
        <Button type="submit" className="w-full" disabled={busy || !identifier || !password}>
          {busy ? "جارٍ الدخول…" : "تسجيل الدخول"}
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Only same-site paths are honoured after login (no open redirects). */
export function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}
