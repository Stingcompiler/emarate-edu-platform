import {
  Award,
  Bell,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Globe,
  Inbox,
  Megaphone,
  Radio,
  Download,
  FileUp,
  FolderLock,
  ScrollText,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

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

export function can(me: Me | null | undefined, capability: string): boolean {
  return !!me?.capabilities?.[capability];
}

/**
 * Destinations that exist today, in priority order (the phone shows the first
 * four as tabs and the rest under «المزيد»). Role dashboards join as their
 * phases land; no link points to a page that isn't built.
 */
export function navFor(me: Me | null | undefined, unread: number): NavItem[] {
  const items: NavItem[] = [
    { label: "الإشعارات", to: "/notifications", icon: Bell, badge: unread },
  ];
  const teaches = hasRole(
    me,
    "teacher",
    "ta",
    "department_manager",
    "department_supervisor",
    "academic_affairs",
    "system_admin",
  );
  if (me?.student || teaches)
    items.push({ label: "الاختبارات", to: "/exams", icon: ClipboardList, end: false });
  if (me?.student || teaches) items.push({ label: "البث", to: "/live", icon: Radio, end: false });
  items.push({ label: "الإعلانات", to: "/announcements", icon: Megaphone, end: false });
  if (hasRole(me, "site_manager", "head_registrar", "registrar", "system_admin")) {
    items.push({ label: "الاستفسارات", to: "/inquiries", icon: Inbox, end: false });
  }
  if (can(me, "content.manage"))
    items.push({ label: "محتوى الموقع", to: "/site", icon: Globe, end: false });
  if (can(me, "events.manage"))
    items.push({ label: "الفعاليات", to: "/events", icon: CalendarDays, end: false });
  if (me?.student) {
    items.push({ label: "النتائج", to: "/results", icon: Award });
    items.push({ label: "اللوائح", to: "/regulations", icon: ScrollText });
  }
  if (can(me, "results.manage"))
    items.push({ label: "رفع النتائج", to: "/result-imports", icon: FileUp, end: false });
  if (can(me, "results.correct") || can(me, "results.approve")) {
    items.push({ label: "طلبات التعديل", to: "/result-corrections", icon: ClipboardCheck });
  }
  if (can(me, "results.correct"))
    items.push({ label: "بحث نتيجة", to: "/results/search", icon: Search });
  if (can(me, "results.settings")) {
    items.push({ label: "إعدادات العرض", to: "/results/settings", icon: SlidersHorizontal });
  }
  if (can(me, "cases.view"))
    items.push({ label: "الحالات", to: "/cases", icon: FolderLock, end: false });
  if (can(me, "regulations.manage"))
    items.push({ label: "اللوائح", to: "/regulations", icon: ScrollText, end: false });
  if (canCompose(me)) items.push({ label: "إشعار جديد", to: "/notifications/new", icon: Send });
  items.push({ label: "الإعدادات", to: "/settings", icon: Settings });
  items.push({ label: "تثبيت التطبيق", to: "/install", icon: Download });
  return items;
}
