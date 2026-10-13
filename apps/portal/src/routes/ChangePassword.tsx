import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import { AuthLayout, Button, Card, Notice, PasswordField, problemMessage } from "../components/ui";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";

/**
 * Change one's own password. After an administrator reset, signing in lands here until the
 * temporary password is replaced (RequireAuth sends the account to this page); from the
 * settings it is the voluntary version. Other sessions of the account end on success.
 */
export function ChangePassword() {
  const me = useMe();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const forced = !!me.data?.must_change_password;

  useEffect(() => {
    document.title = "تغيير كلمة المرور — بوابة كلية الإمارات";
  }, []);

  const rules = [
    { ok: next.length >= 8, label: "8 أحرف فأكثر" },
    { ok: /\p{L}/u.test(next) && /\d/.test(next), label: "حرف ورقم" },
    { ok: !!next && next !== current, label: "تختلف عن الحالية" },
    { ok: !!next && next === again, label: "مطابقة التأكيد" },
  ];

  if (me.isPending) return null;
  if (!me.data) return <Navigate to="/login?next=%2Fchange-password" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { response, error: problem } = await api.POST("/api/v1/auth/change-password", {
      body: { current_password: current, new_password: next },
    });
    setBusy(false);
    if (!response.ok) {
      setError(problemMessage(problem, "تعذّر تغيير كلمة المرور. تحقق من كلمة المرور الحالية."));
      return;
    }
    await client.invalidateQueries({ queryKey: ["me"] });
    navigate("/", { replace: true });
  }

  return (
    <AuthLayout
      title="غيّر كلمة المرور"
      subtitle={
        forced
          ? "أعاد مدير النظام تعيين كلمة مرورك. أدخل الكلمة المؤقتة التي أُعطيتَها، ثم اختر كلمة مرور خاصة بك."
          : "أدخل كلمة المرور الحالية ثم الجديدة. تنتهي جلساتك على الأجهزة الأخرى."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <PasswordField
            label={forced ? "كلمة المرور المؤقتة" : "كلمة المرور الحالية"}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <PasswordField
            label="كلمة المرور الجديدة"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
          <PasswordField
            label="تأكيد كلمة المرور الجديدة"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            required
          />
        </Card>
        <ul className="space-y-1 text-xs">
          {rules.map((r) => (
            <li key={r.label} className={r.ok ? "text-success-strong" : "text-text-muted"}>
              {r.ok ? "✓" : "○"} {r.label}
            </li>
          ))}
        </ul>
        {error && <Notice>{error}</Notice>}
        <Button
          type="submit"
          className="min-h-11 w-full"
          disabled={busy || !current || !rules.every((r) => r.ok)}
        >
          {busy ? "…" : "حفظ كلمة المرور"}
        </Button>
        {!forced && (
          <p className="text-center text-sm">
            <Link to="/settings" className="text-primary hover:underline">
              رجوع إلى الإعدادات
            </Link>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
