import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, Switch, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { count, N } from "../../lib/format";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { useToast } from "../../components/Toast";

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
    queryFn: async () => ok(await api.GET("/api/v1/system-settings")) ?? null,
  });
  const health = useQuery({
    queryKey: ["health"],
    // 503 still carries the checks (a degraded service).
    queryFn: async () => {
      const { data, error } = await api.GET("/api/public/health");
      return data ?? error ?? null;
    },
  });
  const [f, setF] = useState<S | null>(null);
  useEffect(() => {
    if (settings.data) setF(settings.data as S);
  }, [settings.data]);
  const toast = useToast();
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH("/api/v1/system-settings", { body: f! });
      if (!data) throw error;
      return data;
    },
    onSuccess: (data) => {
      // The saved values at once, so the «unsaved changes» bar leaves with the toast.
      client.setQueryData(["system-settings"], data);
      toast("حُفظت الإعدادات");
      void client.invalidateQueries({ queryKey: ["system-settings"] });
    },
  });
  // What differs from the server: shown in one save bar across the page, and guarded when
  // leaving (review 2026-09-29).
  const saved = settings.data as S | undefined;
  const changes =
    f && saved ? (Object.keys(f) as (keyof S)[]).filter((k) => f[k] !== saved[k]).length : 0;
  useUnsavedChanges(changes > 0);
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
      {changes > 0 && (
        <div
          data-dock
          role="region"
          aria-label="تغييرات غير محفوظة"
          className="sticky bottom-24 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-text px-4 py-3 text-bg shadow-lg lg:bottom-6"
        >
          <p className="min-w-0 flex-1 text-sm font-semibold">
            {changes === 1 ? "تغيير واحد غير محفوظ" : `${count(changes, N.change)} غير محفوظة`}
          </p>
          <Button
            variant="ghost"
            className="min-h-11 px-4 text-bg hover:bg-white/10"
            onClick={() => saved && setF(saved)}
          >
            تراجع
          </Button>
          <Button className="min-h-11 px-5" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
          </Button>
        </div>
      )}
    </PortalShell>
  );
}
