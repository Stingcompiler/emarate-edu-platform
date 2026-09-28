import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, Switch, problemMessage } from "../../components/ui";
import { api } from "../../lib/api";

type S = {
  student_registration_requires_approval: boolean;
  applications_fallback_to_head_registrar: boolean;
  delegate_decisions_to_registrars: boolean;
  otp_ttl_minutes: number;
  otp_max_attempts: number;
  max_applications_per_cycle: number;
  grading_days_limit: number;
  upload_min_percent: number;
  planned_lectures_per_week: number;
};

/** Board: SystemAdminSettings — every change is audited with before/after. Integration keys live in the server env. */
export function AdminSettings() {
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => (await api.GET("/api/v1/system-settings")).data ?? null,
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.GET("/api/public/health")).data ?? null,
  });
  const [f, setF] = useState<S | null>(null);
  useEffect(() => {
    if (settings.data) setF(settings.data as S);
  }, [settings.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH("/api/v1/system-settings", { body: f! });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["system-settings"] }),
  });
  if (!f) return <PortalShell title="الإعدادات">{null}</PortalShell>;
  const toggle = (k: keyof S, label: string, hint: string) => (
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
      <span>
        <b className="block text-sm">{label}</b>
        <span className="text-xs text-text-muted">{hint}</span>
      </span>
      <Switch checked={!!f[k]} onChange={(v) => setF({ ...f, [k]: v })} label={label} />
    </div>
  );
  const number = (k: keyof S, label: string, hint: string, min: number, max: number) => (
    <label className="flex items-center justify-between gap-3 px-4 py-3">
      <span>
        <b className="block text-sm">{label}</b>
        <span className="text-xs text-text-muted">{hint}</span>
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={Number(f[k])}
        onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })}
        className="w-20 rounded-lg border border-border px-2 py-1.5 text-center"
      />
    </label>
  );
  return (
    <PortalShell
      title="الإعدادات"
      subtitle="كل تغيير يُسجَّل في التدقيق بالقيمة قبل/بعد"
      back={{ label: "إدارة النظام", to: "/system" }}
    >
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="space-y-4">
          <SectionLabel>التسجيل والقبول</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {toggle(
              "student_registration_requires_approval",
              "تسجيل الطلاب يتطلب موافقة مدير القسم",
              "معطّل = يسجل الطالب فورًا بعد التحقق",
            )}
            {toggle(
              "applications_fallback_to_head_registrar",
              "توجيه الطلبات بلا مسجل إلى مسؤول المسجلين",
              "وإلا تبقى غير موزعة",
            )}
            {toggle(
              "delegate_decisions_to_registrars",
              "تفويض القرار النهائي للمسجلين",
              "القبول والرفض من مسجل القسم",
            )}
            {number("max_applications_per_cycle", "أقصى عدد طلبات لكل بريد في الدورة", "", 1, 10)}
          </Card>
          <SectionLabel>الأمان والتحقق</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {number("otp_ttl_minutes", "صلاحية رمز OTP (دقائق)", "", 2, 60)}
            {number("otp_max_attempts", "محاولات إدخال الرمز", "", 3, 10)}
          </Card>
        </div>
        <div className="mt-6 space-y-4 lg:mt-0">
          <SectionLabel>حدود أداء الأساتذة (التقارير)</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {number(
              "grading_days_limit",
              "حد زمن التصحيح (أيام)",
              "فوقه تنبيه، وفوقه بيومين «تحت الحد»",
              1,
              30,
            )}
            {number("upload_min_percent", "حد انتظام رفع المحاضرات (٪)", "", 10, 100)}
            {number("planned_lectures_per_week", "المحاضرات المخططة أسبوعيًا لكل مادة", "", 1, 10)}
          </Card>
          <SectionLabel>التكاملات</SectionLabel>
          <Card className="divide-y divide-border-soft text-sm">
            <p className="flex justify-between px-4 py-2.5">
              <span className="text-text-muted">قاعدة البيانات</span>
              <b>{health.data?.database === "ok" ? "متصلة" : "خلل"}</b>
            </p>
            <p className="flex justify-between px-4 py-2.5">
              <span className="text-text-muted">الذاكرة المؤقتة</span>
              <b>{health.data?.cache === "ok" ? "تعمل" : "خلل"}</b>
            </p>
            <p className="flex justify-between px-4 py-2.5">
              <span className="text-text-muted">الإصدار</span>
              <bdi>{health.data?.version ?? "—"}</bdi>
            </p>
            <p className="px-4 py-3 text-xs text-text-muted">
              مفاتيح البريد والـ Push والتخزين وإعادة بناء الموقع تُغيَّر من ملف البيئة على الخادم
              لا من هنا.
            </p>
          </Card>
        </div>
      </div>
      {save.isError && (
        <div className="mt-4">
          <Notice>{problemMessage(save.error)}</Notice>
        </div>
      )}
      {save.isSuccess && (
        <div className="mt-4">
          <Notice tone="success">حُفظت الإعدادات.</Notice>
        </div>
      )}
      <Button className="mt-4" onClick={() => save.mutate()} disabled={save.isPending}>
        حفظ الإعدادات
      </Button>
    </PortalShell>
  );
}
