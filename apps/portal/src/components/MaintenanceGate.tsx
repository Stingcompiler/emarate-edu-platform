import { MAINTENANCE_EVENT } from "@ecst/api";
import { Wrench } from "lucide-react";
import { useEffect, useState } from "react";

const ASK_EVERY_MS = 4000;

/**
 * «المنصة في صيانة»: while a backup is being restored the API answers 503 `maintenance` to
 * everyone (core.middleware.MaintenanceMiddleware). The first such answer puts this screen
 * over the page; it asks the one open question — is it over? — every few seconds and loads the
 * page again when it is, on rows that are no longer the ones it was showing. The same on
 * phones and large screens: one centred message, no page behind it to act on.
 */
export function MaintenanceGate({
  reopen = () => window.location.reload(),
}: {
  /** What «the platform is back» does; the tests pass their own. */
  reopen?: () => void;
}) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const close = () => setClosed(true);
    window.addEventListener(MAINTENANCE_EVENT, close);
    return () => window.removeEventListener(MAINTENANCE_EVENT, close);
  }, []);
  useEffect(() => {
    if (!closed) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/public/maintenance", { cache: "no-store" });
        if (response.ok && (await response.json()).maintenance === false) reopen();
      } catch {
        // Offline, or the server restarting: ask again at the next turn.
      }
    }, ASK_EVERY_MS);
    return () => clearInterval(timer);
  }, [closed, reopen]);
  if (!closed) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-body"
      className="fixed inset-0 z-[90] grid place-items-center bg-bg p-6 text-center"
    >
      <div className="max-w-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Wrench size={26} aria-hidden />
        </span>
        <h1 id="maintenance-title" className="mt-4 text-lg font-bold text-text">
          المنصة في صيانة قصيرة
        </h1>
        <p id="maintenance-body" className="mt-2 text-sm leading-7 text-text-muted">
          تُستعاد الآن نسخة احتياطية. تعود المنصة خلال دقائق، وهذه الصفحة تفتح من جديد وحدها حين
          تعود؛ لا حاجة إلى إغلاقها.
        </p>
        <p role="status" className="mt-4 text-xs text-text-muted">
          جارٍ الانتظار…
        </p>
      </div>
    </div>
  );
}
