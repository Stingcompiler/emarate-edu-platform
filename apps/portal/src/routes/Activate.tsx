import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { AuthLayout, Button, Card, Field, Notice, problemMessage } from "../components/ui";
import { api } from "../lib/api";

/**
 * Board: AuthActivate (phone); desktop uses the centred auth card.
 * Staff invitations and the first system admin land here from the emailed
 * link `/activate/<token>`; the owner of the email chooses the password.
 */
export function Activate() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "تفعيل الحساب — بوابة كلية الإمارات";
    void api.GET("/api/public/csrf");
  }, []);

  const rules = [
    { ok: password.length >= 8, label: "8 أحرف فأكثر" },
    { ok: /\p{L}/u.test(password) && /\d/.test(password), label: "حرف ورقم" },
    { ok: !!password && password === confirm, label: "مطابقة التأكيد" },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await api.POST("/api/public/activate", { body: { token, password } });
    setBusy(false);
    if (!data) {
      setError(
        problemMessage(
          error,
          "الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من مدير النظام.",
        ),
      );
      return;
    }
    setDone(true);
  }

  if (done)
    return (
      <AuthLayout title="تم تفعيل حسابك" subtitle="يمكنك الدخول الآن ببريدك وكلمة المرور الجديدة.">
        <Button className="w-full" onClick={() => navigate("/login")}>
          الدخول
        </Button>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="فعّل حسابك"
      subtitle="اختر كلمة مرور لتدخل البوابة. الرابط يُستخدم مرة واحدة."
    >
      <form onSubmit={submit} className="space-y-4">
        <Card>
          <Field
            label="كلمة المرور"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <Field
            label="تأكيد كلمة المرور"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Card>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> إظهار
          كلمة المرور
        </label>
        <ul className="space-y-1 text-xs">
          {rules.map((r) => (
            <li key={r.label} className={r.ok ? "text-success-strong" : "text-text-muted"}>
              {r.ok ? "✓" : "○"} {r.label}
            </li>
          ))}
        </ul>
        {error && <Notice>{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy || !rules.every((r) => r.ok)}>
          {busy ? "…" : "تفعيل والدخول"}
        </Button>
        <p className="text-center text-xs text-text-muted">
          بالتفعيل توافق على{" "}
          <Link to="/regulations" className="underline">
            لوائح الكلية
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
