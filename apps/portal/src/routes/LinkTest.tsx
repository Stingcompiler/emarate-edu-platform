import { PortalShell } from "../components/PortalShell";
import { Card, Notice, SectionLabel } from "../components/ui";
import { isStandalone } from "../lib/push";
import { SITE_URL, siteLink } from "../lib/site";

/**
 * TEMPORARY (plan 2026-11-12, phase 2): which way out of the installed app really opens the
 * phone's browser. The system admin opens this page from the installed app (Settings ← «تجربة
 * روابط الموقع»), taps each form and reports what each did. Removed once one is chosen.
 * No board: a plain list, the same in the phone and desktop shells (docs/06 §9).
 */
export function LinkTest() {
  const url = SITE_URL;
  const target = new URL(url);
  const address = `${target.host}${target.pathname}${target.search}${target.hash}`;
  const fallback = encodeURIComponent(url);
  const scheme = target.protocol.slice(0, -1);
  const current = siteLink(url);
  const forms: { n: number; label: string; who: string; href: string; blank?: boolean }[] = [
    {
      n: 1,
      label: "الرابط الحالي في البوابة",
      who: "هذا الجهاز",
      href: current.href,
      blank: current.target === "_blank",
    },
    {
      n: 2,
      label: "طلب متصفح من النظام (intent)",
      who: "Android",
      href:
        `intent://${address}#Intent;scheme=${scheme};action=android.intent.action.VIEW;` +
        `category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallback};end`,
    },
    {
      n: 3,
      label: "طلب Chrome بالاسم (intent)",
      who: "Android",
      href: `intent://${address}#Intent;scheme=${scheme};package=com.android.chrome;end`,
    },
    {
      n: 4,
      label: "عنوان Chrome الخاص",
      who: "Android",
      href: `googlechrome://navigate?url=${fallback}`,
    },
    { n: 5, label: "عنوان Safari الخاص", who: "iPhone وiPad", href: `x-safari-${url}` },
    { n: 6, label: "نافذة جديدة", who: "الكل", href: url, blank: true },
  ];

  return (
    <PortalShell title="تجربة روابط الموقع">
      <div className="mx-auto w-full max-w-[720px] space-y-4">
        <Notice tone={isStandalone() ? "success" : "warning"}>
          {isStandalone()
            ? "أنت داخل التطبيق المثبّت. اضغط كل رابط، ثم عد إلى التطبيق وجرّب التالي."
            : "أنت في المتصفح لا في التطبيق المثبّت: افتح هذه الصفحة من التطبيق (الإعدادات ← تجربة روابط الموقع)."}
        </Notice>
        <Card className="p-4 text-sm leading-7 text-text">
          سجّل لكل رقم ما حدث:
          <span className="block">أ — فُتح تطبيق المتصفح نفسه (Chrome أو Safari).</span>
          <span className="block">ب — ظهر الموقع فوق التطبيق، بزر إغلاق أو شريط عنوان.</span>
          <span className="block">ج — حلّ الموقع محل صفحة التطبيق.</span>
          <span className="block">د — لم يحدث شيء، أو ظهرت رسالة خطأ.</span>
        </Card>

        <SectionLabel>الروابط</SectionLabel>
        <Card className="divide-y divide-border-soft">
          {forms.map((f) => (
            <a
              key={f.n}
              href={f.href}
              {...(f.blank ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-alt"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                {f.n}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-text">
                  {f.label} <span className="text-xs font-normal text-text-muted">· {f.who}</span>
                </span>
                <span
                  dir="ltr"
                  className="mt-1 block break-all text-start font-mono text-xs text-text-muted"
                >
                  {f.href}
                  {f.blank ? "  (target=_blank)" : ""}
                </span>
              </span>
            </a>
          ))}
        </Card>

        <SectionLabel>هذا الجهاز</SectionLabel>
        <Card className="p-4">
          <p dir="ltr" className="break-all text-start font-mono text-xs leading-6 text-text-muted">
            standalone: {String(isStandalone())} · touch: {navigator.maxTouchPoints ?? 0}
            <br />
            {navigator.userAgent}
          </p>
        </Card>
      </div>
    </PortalShell>
  );
}
