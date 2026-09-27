import type { Health } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpenText, Globe } from "lucide-react";

import { AppShell, type NavItem } from "../components/AppShell";
import { api } from "../lib/api";

/**
 * Phase 0 screen: proves the full chain works end to end —
 * React → typed client (generated from OpenAPI) → Vite proxy → Django → DB.
 * Replaced by the real "Today" screen when the portal gets its pages.
 *
 * No prototype board exists for this temporary page; its two layouts follow
 * the portal shell rules (docs/06 §9): phone = large title + stacked cards,
 * desktop = TopBar + right sidebar + two columns.
 */
const NAV: NavItem[] = [
  { label: "حالة النظام", to: "/system", icon: Activity },
  { label: "توثيق الـ API", to: "/api/docs/", icon: BookOpenText, external: true },
  { label: "الموقع العام", to: "http://localhost:4321/", icon: Globe, external: true },
];

const PHASES = [
  { name: "المرحلة 0 — الأساس", state: "done" },
  { name: "المرحلة 1 — النواة: الهيكل الأكاديمي والحسابات والأدوار", state: "next" },
  { name: "المرحلة 2 — التعلّم: المحاضرات والواجبات", state: "later" },
  { name: "المرحلة 3 — الإشعارات وتطبيق الويب (PWA)", state: "later" },
] as const;

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
    <AppShell
      eyebrow="كلية الإمارات للعلوم والتقنية"
      title="حالة النظام"
      subtitle="المرحلة 0 — الأساس التقني يعمل"
      nav={NAV}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section
          aria-labelledby="status-title"
          className="overflow-hidden rounded-lg border border-border-soft bg-surface shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <h2 id="status-title" className="text-base font-bold text-text">
              الخدمات
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

          {health.isError && (
            <p
              role="alert"
              className="border-t border-border-soft bg-danger-soft px-4 py-3 text-sm text-danger-strong"
            >
              تعذّر الوصول إلى الخادم. شغّل <code className="font-mono">pnpm dev</code> من جذر
              المستودع.
            </p>
          )}
        </section>

        <aside
          aria-labelledby="phases-title"
          className="overflow-hidden rounded-lg border border-border-soft bg-surface shadow-sm"
        >
          <h2
            id="phases-title"
            className="border-b border-border-soft px-4 py-3 text-base font-bold text-text"
          >
            مراحل البناء
          </h2>
          <ol className="divide-y divide-border-soft text-sm">
            {PHASES.map((phase) => (
              <li key={phase.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className={phase.state === "later" ? "text-text-muted" : "text-text"}>
                  {phase.name}
                </span>
                <PhaseChip state={phase.state} />
              </li>
            ))}
          </ol>
          <p className="border-t border-border-soft px-4 py-3 text-xs leading-relaxed text-text-muted">
            شاشة مؤقتة تثبت السلسلة كاملة: الواجهة ← العميل المولَّد من OpenAPI ← Django ← قاعدة
            البيانات. تُستبدل بشاشة «اليوم» عند بناء صفحات البوابة.
          </p>
        </aside>
      </div>
    </AppShell>
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
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
      aria-live="polite"
    >
      {label}
    </span>
  );
}

const PHASE_CHIP = {
  done: { label: "مكتملة", cls: "bg-success-soft text-success-strong" },
  next: { label: "التالية", cls: "bg-info-soft text-info-strong" },
  later: { label: "لاحقًا", cls: "bg-neutral-soft text-neutral-strong" },
} as const;

function PhaseChip({ state }: { state: keyof typeof PHASE_CHIP }) {
  const { label, cls } = PHASE_CHIP[state];
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
