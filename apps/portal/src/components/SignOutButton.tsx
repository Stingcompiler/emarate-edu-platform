import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";

import { useSignOut } from "../lib/auth";

/** What «خروج» does everywhere: end the session, drop the cached data, go to the sign-in page. */
export function useSignOutAction() {
  const signOut = useSignOut();
  const navigate = useNavigate();
  return async () => {
    await signOut();
    navigate("/login", { replace: true });
  };
}

/** The phone's «خروج»: in the header of every page for every signed-in role (owner, 2026-10-29:
 *  it was reachable only through Settings or «أنا», and a student's phone has no «المزيد»). */
export function SignOutButton({ className = "" }: { className?: string }) {
  const out = useSignOutAction();
  return (
    <button
      type="button"
      onClick={out}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${className}`}
    >
      <LogOut size={18} strokeWidth={1.75} aria-hidden className="rtl:-scale-x-100" />
      خروج
    </button>
  );
}
