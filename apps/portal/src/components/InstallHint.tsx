import { Download, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { isStandalone } from "../lib/push";

const KEY = "ecst-install-hint-dismissed";

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** First-run PWA onboarding on phones (docs/02 §5.5): a one-line hint until installed or dismissed. */
export function InstallHint() {
  const [hidden, setHidden] = useState(() => isStandalone() || dismissed());
  if (hidden) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: just hide for this visit */
    }
    setHidden(true);
  };
  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-700 lg:hidden"
      role="note"
    >
      <Download size={18} aria-hidden />
      <span className="flex-1">
        ثبّت التطبيق على هاتفك لتصلك الإشعارات ويعمل التنزيل دون اتصال.
      </span>
      <Link
        to="/install"
        className="-my-2 inline-flex min-h-11 items-center px-2 font-semibold underline"
      >
        كيف؟
      </Link>
      <button
        type="button"
        aria-label="إخفاء"
        onClick={close}
        className="grid size-8 place-items-center rounded-full hover:bg-white/50"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
