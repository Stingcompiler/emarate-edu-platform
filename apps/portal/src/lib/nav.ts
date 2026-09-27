import { Bell, Download, Send, Settings } from "lucide-react";

import type { NavItem } from "../components/AppShell";
import { hasRole, type Me } from "./auth";

/** Roles that can compose notifications (docs/03 §8). HR writes HR notices instead. */
const SENDERS = [
  "system_admin",
  "head_registrar",
  "academic_affairs",
  "student_affairs",
  "department_manager",
  "department_supervisor",
  "teacher",
  "ta",
  "site_manager",
  "events_manager",
];

export function canCompose(me: Me | null | undefined): boolean {
  return hasRole(me, ...SENDERS);
}

/**
 * Destinations that exist today. Role dashboards (Today, courses, tasks) join
 * this list as their phases land; no link points to a page that isn't built.
 */
export function navFor(me: Me | null | undefined, unread: number): NavItem[] {
  const items: NavItem[] = [
    { label: "الإشعارات", to: "/notifications", icon: Bell, badge: unread },
  ];
  if (canCompose(me)) items.push({ label: "إشعار جديد", to: "/notifications/new", icon: Send });
  items.push({ label: "الإعدادات", to: "/settings", icon: Settings });
  items.push({ label: "تثبيت التطبيق", to: "/install", icon: Download });
  return items;
}
