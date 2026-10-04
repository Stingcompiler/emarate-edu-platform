import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut } from "lucide-react";
import { type ComponentProps, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { api } from "../lib/api";
import { hasRole, useMe, useSignOut } from "../lib/auth";
import { navFor } from "../lib/nav";
import { AppShell, Badge } from "./AppShell";
import { InstallHint } from "./InstallHint";
import { PushPrompt } from "./PushPrompt";
import { Notice } from "./ui";
import { ThemeToggle } from "./ThemeToggle";

type Props = Omit<ComponentProps<typeof AppShell>, "nav" | "actions" | "eyebrow">;

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/notifications/unread-count");
      return data ?? { count: 0, by_category: {} };
    },
    // docs/04: poll every 60 s; a push message invalidates it immediately.
    refetchInterval: 60_000,
  });
}

/** The signed-in portal chrome: role navigation, unread badge, account actions. */
export function PortalShell(props: Props) {
  const me = useMe();
  const unread = useUnreadCount();
  const client = useQueryClient();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const count = unread.data?.count ?? 0;

  useEffect(() => {
    // The Service Worker tells open pages when a push arrives.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "push") client.invalidateQueries({ queryKey: ["notifications"] });
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [client]);

  useEffect(() => {
    document.title = `${props.title} — بوابة كلية الإمارات`;
  }, [props.title]);

  return (
    <AppShell
      {...props}
      eyebrow={me.data?.full_name_ar}
      // Students and teachers benefit most from push + offline: nudge them to install on phones.
      children={
        <>
          {/* A suspended student's courses, exams and sessions close (review C2): say why on
              every page instead of showing empty lists. */}
          {me.data?.student?.status === "suspended" && (
            <div className="mb-4">
              <Notice tone="warning">
                قيدك موقوف حاليًا: المواد والاختبارات وجلسات البث غير متاحة حتى رفع الإيقاف. نتائجك
                وإشعاراتك وحالتك تبقى متاحة؛ للاستفسار راجع شؤون الطلاب.
              </Notice>
            </div>
          )}
          {/* Only on the home screens (review 2026-09-29): not above exams, grading or forms. */}
          {(me.data?.student || hasRole(me.data, "teacher", "ta")) &&
            (pathname === "/" || pathname === "/me") && <InstallHint />}
          {/* Every role: the invitation to turn notifications on (home and notifications). */}
          {me.data && (pathname === "/" || pathname === "/notifications") && <PushPrompt />}
          {props.children}
        </>
      }
      nav={navFor(me.data, count)}
      actions={
        <>
          <ThemeToggle className="hover:bg-white/10" />
          <Link
            to="/notifications"
            className="relative grid size-10 place-items-center rounded-full hover:bg-white/10"
            aria-label="الإشعارات"
          >
            <Bell size={20} strokeWidth={1.75} aria-hidden />
            <Badge count={count} className="absolute -top-0.5 -end-0.5" />
          </Link>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
            className="flex h-10 items-center gap-2 rounded-full px-3 text-sm hover:bg-white/10"
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden className="rtl:-scale-x-100" />
            خروج
          </button>
        </>
      }
    />
  );
}
