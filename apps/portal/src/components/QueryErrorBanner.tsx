import { RotateCw, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { queryErrors, retryFailed } from "../lib/queryClient";

const MESSAGES: Record<number, string> = {
  403: "ليست لديك صلاحية لعرض بعض هذه البيانات.",
  404: "لم نجد بعض ما تطلبه — ربما حُذف أو تغيّر رابطه.",
  0: "تعذّر الاتصال — تحقق من الإنترنت ثم أعد المحاولة.",
};

/**
 * One place that says a read failed (review 2026-09-29, P1): above the phone's tab bar, at
 * the bottom corner on large screens. Pages still show what they could load.
 */
export function QueryErrorBanner() {
  const report = useSyncExternalStore(queryErrors.subscribe, queryErrors.get);
  if (!report) return null;
  const text = MESSAGES[report.status] ?? "تعذّر تحميل بعض البيانات. أعد المحاولة بعد لحظات.";
  const retry = report.status !== 403 && report.status !== 404;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-28 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-text px-4 py-3 text-sm text-bg shadow-lg lg:inset-x-auto lg:bottom-6 lg:end-6"
    >
      <p className="min-w-0 flex-1">{text}</p>
      {retry && (
        <button
          type="button"
          onClick={retryFailed}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-semibold hover:bg-white/10"
        >
          <RotateCw size={16} aria-hidden />
          أعد المحاولة
        </button>
      )}
      <button
        type="button"
        aria-label="إغلاق"
        onClick={queryErrors.clear}
        className="grid size-11 place-items-center rounded-xl hover:bg-white/10"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
