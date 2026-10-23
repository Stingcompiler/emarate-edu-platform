import { CloudOff } from "lucide-react";

import { useOnline } from "../lib/online";

/**
 * A quiet strip across the top while the device is offline (design reference §8): it says what is
 * safe («ما تكتبه محفوظ على هذا الجهاز») and promises what happens next, in the neutral «pending»
 * colour, not a warning: nothing is wrong, only not yet delivered. It never blocks anything.
 */
export function ConnectivityBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-start gap-2 rounded-lg border border-pending bg-pending-soft px-3 py-2 text-sm text-pending-strong"
    >
      <CloudOff size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>جهازك غير متصل الآن. ما تكتبه محفوظ على هذا الجهاز وسيُرسل عند عودة الاتصال.</span>
    </div>
  );
}
