import { BellRing, X } from "lucide-react";
import { useEffect, useState } from "react";

import { type PushState, enablePush, pushState } from "../lib/push";
import { useToast } from "./Toast";

const KEY = "ecst-push-prompt-snoozed";
const SNOOZE_DAYS = 14;

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(KEY) ?? 0);
    return Date.now() - at < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Invites the user to turn notifications on for this device (owner, 2026-10-01: «the app
 * never asks»). Browsers — and iPhone, only inside the installed app — show the permission
 * request only after a tap, so this card offers that tap. It appears while the device supports
 * push and the user hasn't decided yet; «لاحقًا» hides it for two weeks.
 */
export function PushPrompt() {
  const [hidden, setHidden] = useState(snoozed);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const toast = useToast();
  useEffect(() => {
    if (hidden) return;
    let live = true;
    void pushState()
      .then((s) => live && setState(s))
      .catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, [hidden]);
  if (hidden || state !== "off" || Notification.permission !== "default") return null;

  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* private mode: just hide for this visit */
    }
    setHidden(true);
  };
  const enable = async () => {
    setBusy(true);
    setProblem("");
    try {
      const next = await enablePush();
      setState(next);
      if (next === "on") toast("فُعّلت الإشعارات على هذا الجهاز");
      else if (next === "denied")
        setProblem("رفضت الإذن. يمكنك تفعيله لاحقًا من إعدادات المتصفح لهذا الموقع.");
    } catch {
      setProblem("تعذّر التفعيل الآن. حاول مرة أخرى، أو من «الإعدادات».");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="mb-4 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-700"
      role="note"
    >
      <div className="flex items-start gap-3">
        <BellRing size={18} aria-hidden className="mt-0.5 shrink-0" />
        <p className="flex-1">
          <b className="block">فعّل الإشعارات على هذا الجهاز</b>
          تصلك المواعيد والدرجات والإعلانات فور إرسالها، حتى والتطبيق مغلق.
        </p>
        <button
          type="button"
          aria-label="لاحقًا"
          onClick={later}
          className="-me-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/50"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {problem && (
        <p className="mt-2 text-xs text-danger-strong" role="alert">
          {problem}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-on-primary disabled:opacity-60"
        >
          {busy ? "لحظة…" : "تفعيل"}
        </button>
        <button
          type="button"
          onClick={later}
          className="inline-flex min-h-11 items-center rounded-full px-4 font-semibold"
        >
          لاحقًا
        </button>
      </div>
    </div>
  );
}
