import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut } from "lucide-react";
import { type ComponentProps, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { api } from "../lib/api";
import { hasRole, useMe, useSignOut } from "../lib/auth";
import { navFor } from "../lib/nav";
import { AppShell, Badge } from "./AppShell";
import { ConnectivityBar } from "./ConnectivityBar";
import { InstallHint } from "./InstallHint";
import { PushPrompt } from "./PushPrompt";
import { Avatar, Notice } from "./ui";

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

/** Two letters for the account button: the first letters of the first two names. */
const initialsOf = (name: string) =>
  name
    .replace(/^(د|أ|م)\.\s*/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.replace(/^ال(?=.)/, "")[0])
    .join("");

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
          <ConnectivityBar />
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
          {/* On the notification centre the invitation to turn them on comes first. */}
          {me.data && pathname === "/notifications" && <PushPrompt />}
          {props.children}
          {/* On the home screens the optional set-up (install, notifications) comes after the
              day's work, not before it (review 2026-10-04 UX5; 2026-09-29: never above exams,
              grading or forms). */}
          {me.data && (pathname === "/" || pathname === "/me") && (
            <div className="mt-6 space-y-3">
              {pathname === "/" && <PushPrompt />}
              {(me.data.student || hasRole(me.data, "teacher", "ta")) && <InstallHint />}
            </div>
          )}
        </>
      }
      nav={navFor(me.data, count)}
      actions={
        <>
          <Link
            to="/notifications"
            className="relative grid size-10 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-text"
            aria-label="الإشعارات"
          >
            <Bell size={20} strokeWidth={1.75} aria-hidden />
            <Badge count={count} className="absolute -top-0.5 -end-0.5" />
          </Link>
          <Link
            to="/settings"
            aria-label="حسابي"
            title={me.data?.full_name_ar}
            className="rounded-full focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Avatar
              text={initialsOf(me.data?.full_name_ar ?? "")}
              size="md"
              tone="neutral"
              photo={me.data?.photo}
            />
          </Link>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
            className="flex h-10 items-center gap-2 rounded-full px-3 text-sm text-text-muted hover:bg-surface-alt hover:text-text"
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden className="rtl:-scale-x-100" />
            خروج
          </button>
        </>
      }
    />
  );
}
