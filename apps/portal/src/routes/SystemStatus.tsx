import type { Health } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

/**
 * Phase 0 landing screen: proves the full chain works end to end —
 * React → typed client (generated from OpenAPI) → Vite proxy → Django → DB.
 * Replaced by the real "Today" screen in Phase 1/10.
 */
export function SystemStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async (): Promise<Health> => {
      const { data, error, response } = await api.GET("/api/public/health");
      // 503 carries a Health body too ("degraded"); anything else is an outage.
      if (data) return data;
      if (response.status === 503 && error) return error as Health;
      throw new Error(`HTTP ${response.status}`);
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="bg-header px-4 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-text-inverse">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-semibold text-primary-200">كلية الإمارات للعلوم والتقنية</p>
          <h1 className="mt-1 text-2xl font-bold">بوابة الكلية</h1>
          <p className="mt-1 text-sm text-navy-200">المرحلة 0 — الأساس التقني يعمل</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <section
          aria-labelledby="status-title"
          className="overflow-hidden rounded-lg border border-border-soft bg-surface shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <h2 id="status-title" className="text-base font-bold text-text">
              حالة النظام
            </h2>
            <StatusChip
              state={health.isPending ? "loading" : health.isError ? "down" : health.data.status}
            />
          </div>

          <dl className="divide-y divide-border-soft text-sm">
            <Row
              label="الواجهة البرمجية (API)"
              value={health.isError ? "غير متاحة" : health.isPending ? "…" : "متصلة"}
            />
            <Row label="قاعدة البيانات" value={check(health.data?.database)} />
            <Row label="الذاكرة المؤقتة" value={check(health.data?.cache)} />
            <Row label="الإصدار" value={health.data?.version ?? "—"} mono />
            <Row
              label="وقت الخادم"
              value={
                health.data
                  ? new Intl.DateTimeFormat("ar", {
                      dateStyle: "medium",
                      timeStyle: "medium",
                      timeZone: "Africa/Khartoum",
                      numberingSystem: "latn",
                    }).format(new Date(health.data.server_time))
                  : "—"
              }
            />
          </dl>
        </section>

        {health.isError && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-strong"
          >
            تعذّر الوصول إلى الخادم. شغّل <code className="font-mono">pnpm dev</code> من جذر
            المستودع.
          </p>
        )}

        <p className="mt-6 text-xs leading-relaxed text-text-muted">
          هذه الشاشة مؤقتة لإثبات السلسلة كاملة: الواجهة ← العميل المولَّد من OpenAPI ← Django ←
          قاعدة البيانات. تُستبدل بشاشة «اليوم» عند بناء المراحل التالية.
        </p>
      </main>
    </div>
  );
}

function check(value: "ok" | "error" | undefined) {
  if (value === undefined) return "—";
  return value === "ok" ? "سليمة" : "خطأ";
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-text" : "font-semibold text-text"}>{value}</dd>
    </div>
  );
}

const CHIP = {
  loading: { label: "جارٍ الفحص", cls: "bg-neutral-soft text-neutral-strong" },
  ok: { label: "يعمل", cls: "bg-success-soft text-success-strong" },
  degraded: { label: "متعثّر", cls: "bg-warning-soft text-warning-strong" },
  down: { label: "متوقف", cls: "bg-danger-soft text-danger-strong" },
} as const;

function StatusChip({ state }: { state: keyof typeof CHIP }) {
  const { label, cls } = CHIP[state];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`} aria-live="polite">
      {label}
    </span>
  );
}
