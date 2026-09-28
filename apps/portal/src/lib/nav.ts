import {
  Award,
  Bell,
  CalendarDays,
  BarChart3,
  History,
  LayoutDashboard,
  Library,
  UserRound,
  Users,
  BookOpen,
  Building2,
  ListChecks,
  Sun,
  CalendarRange,
  GraduationCap,
  UserCheck,
  FileText,
  LayoutTemplate,
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
/**
 * Department manager / supervisor: the dashboard keeps exactly its sections, in
 * this order (docs/02 §4.15, owner rule); new tabs are appended, never inserted.
 */
function departmentNav(me: Me | null | undefined, unread: number): NavItem[] {
  const teaches = hasRole(me, "teacher", "ta");
  return [
    { label: "الرئيسية", to: "/department", icon: LayoutDashboard },
    { label: "المواد", to: "/department/courses", icon: BookOpen },
    { label: "المحاضرات", to: "/department/lectures", icon: Library },
    { label: "الأساتذة", to: "/department/teachers", icon: UserCheck },
    { label: "طلاب القسم", to: "/department/students", icon: Users },
    { label: "التقارير", to: "/reports", icon: BarChart3 },
    { label: "النتائج", to: "/result-imports", icon: FileUp, end: false },
    { label: "سجل العمليات", to: "/department/audit", icon: History },
    ...(teaches ? [{ label: "موادي", to: "/courses", icon: BookOpen, end: false }] : []),
    // Additions (never replace the sections above).
    { label: "طلبات التسجيل", to: "/department/approvals", icon: ClipboardCheck },
    { label: "الاختبارات", to: "/exams", icon: ClipboardList, end: false },
    { label: "جلسات البث", to: "/live", icon: Radio, end: false },
    { label: "الإعلانات", to: "/announcements", icon: Megaphone, end: false },
    { label: "الإشعارات", to: "/notifications", icon: Bell, badge: unread },
    { label: "إشعار جديد", to: "/notifications/new", icon: Send },
    { label: "الإعدادات", to: "/settings", icon: Settings },
    { label: "تثبيت التطبيق", to: "/install", icon: Download },
  ];
}

export function navFor(me: Me | null | undefined, unread: number): NavItem[] {
  if (hasRole(me, "department_manager", "department_supervisor")) return departmentNav(me, unread);
  const items: NavItem[] = [];
  if (hasRole(me, "system_admin")) {
    items.push({ label: "إدارة النظام", short: "الرئيسية", to: "/system", icon: LayoutDashboard });
    items.push({ label: "المستخدمون", to: "/system/users", icon: Users, end: false });
    items.push({
      label: "الهيكل الأكاديمي",
      short: "الهيكل",
      to: "/system/structure",
      icon: Building2,
    });
    items.push({
      label: "إعدادات النظام",
      short: "الإعدادات",
      to: "/system/settings",
      icon: SlidersHorizontal,
    });
    items.push({ label: "التدقيق", to: "/audit", icon: History });
  }
  if (me?.student) {
    return [
      { label: "اليوم", to: "/", icon: Sun },
      { label: "موادي", to: "/courses", icon: BookOpen, end: false },
      { label: "المهام", to: "/tasks", icon: ListChecks },
      { label: "الإشعارات", to: "/notifications", icon: Bell, badge: unread },
      { label: "أنا", to: "/me", icon: UserRound, end: false },
    ];
  }
  if (hasRole(me, "results_officer"))
    items.push({ label: "الرئيسية", to: "/results-office", icon: LayoutDashboard });
  if (hasRole(me, "academic_affairs"))
    items.push({ label: "الرئيسية", to: "/academic", icon: LayoutDashboard });
  if (hasRole(me, "student_affairs"))
    items.push({ label: "الرئيسية", to: "/affairs", icon: LayoutDashboard });
  if (me?.student || hasRole(me, "teacher", "ta"))
    items.push({ label: "موادي", to: "/courses", icon: BookOpen, end: false });
  if (me?.student) items.push({ label: "المهام", to: "/tasks", icon: ListChecks });
  if (hasRole(me, "teacher", "ta")) {
    items.unshift({ label: "اليوم", to: "/", icon: Sun });
    items.push({ label: "التصحيح", to: "/grading", icon: ClipboardCheck });
  }
  items.push({ label: "الإشعارات", to: "/notifications", icon: Bell, badge: unread });
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
  if (can(me, "admissions.review"))
    items.push({ label: "القبول", to: "/registrar", icon: LayoutDashboard });
  if (can(me, "admissions.view"))
    items.push({ label: "الطلبات", to: "/applications", icon: FileText, end: false });
  if (can(me, "students.import")) {
    items.push({ label: "سجل الطلاب", to: "/students", icon: Users, end: false });
    items.push({ label: "استيراد الطلاب", to: "/student-imports", icon: FileUp, end: false });
  }
  if (can(me, "admissions.manage") && hasRole(me, "head_registrar", "system_admin"))
    items.push({ label: "المسجلون", to: "/registrars", icon: UserCheck });
  if (can(me, "admissions.manage")) {
    items.push({ label: "دورات القبول", to: "/admissions/cycles", icon: CalendarRange });
    items.push({ label: "قوالب التقديم", to: "/admissions/forms", icon: LayoutTemplate });
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
  if (can(me, "reports.department"))
    items.push({ label: "التقارير", to: "/reports", icon: BarChart3 });
  if (can(me, "hr.view")) items.push({ label: "الموارد البشرية", to: "/hr", icon: UserCheck });
  if (can(me, "reports.teachers"))
    items.push({ label: "مؤشرات الأساتذة", to: "/hr/teachers", icon: UserCheck, end: false });
  if (can(me, "reports.admissions"))
    items.push({ label: "تقارير القبول", to: "/reports/admissions", icon: BarChart3 });
  if (can(me, "reports.affairs"))
    items.push({ label: "تقارير شؤون الطلاب", to: "/reports/affairs", icon: BarChart3 });
  if (can(me, "results.view"))
    items.push({ label: "السجل الأكاديمي", to: "/transcripts", icon: GraduationCap });
  if (can(me, "cases.view"))
    items.push({ label: "الحالات", to: "/cases", icon: FolderLock, end: false });
  if (can(me, "regulations.manage"))
    items.push({ label: "اللوائح", to: "/regulations", icon: ScrollText, end: false });
  if (canCompose(me)) items.push({ label: "إشعار جديد", to: "/notifications/new", icon: Send });
  items.push({ label: "الإعدادات", to: "/settings", icon: Settings });
  items.push({ label: "تثبيت التطبيق", to: "/install", icon: Download });
  return items;
}
