import { hasRole, type Me } from "./auth";
import { can, canCompose } from "./nav";

/**
 * Who may open each portal page (review 2026-09-29, P2). The server enforces every read and
 * write; this only stops a page from rendering zeros, empty lists or forms that would be
 * refused — the user sees «غير مسموح» instead. Keep in step with navFor() in lib/nav.ts:
 * every link a role's navigation shows must be allowed here (the e2e sweep checks it).
 */
export type Allow = (me: Me) => boolean;

const anyone: Allow = () => true;
const student: Allow = (me) => !!me.student;
const role =
  (...roles: string[]): Allow =>
  (me) =>
    hasRole(me, ...roles);
const cap =
  (...capabilities: string[]): Allow =>
  (me) =>
    capabilities.some((c) => can(me, c));
const either =
  (...rules: Allow[]): Allow =>
  (me) =>
    rules.some((rule) => rule(me));

const teaching = either(role("teacher", "ta"), cap("learning.manage"));
const learning = either(student, role("teacher", "ta"), cap("learning.view"));
const announcers = role(
  "system_admin",
  "head_registrar",
  "registrar",
  "academic_affairs",
  "department_manager",
  "department_supervisor",
  "teacher",
  "ta",
  "site_manager",
  "events_manager",
);
const departmentPages = either(
  role("department_manager", "department_supervisor", "academic_affairs", "system_admin"),
);
const anyReport = cap(
  "reports.department",
  "reports.teachers",
  "reports.admissions",
  "reports.affairs",
);

export const ROUTE_ACCESS: Record<string, Allow> = {
  "/": anyone,
  "/courses": learning,
  "/courses/:id": learning,
  "/courses/:id/students": either(role("teacher", "ta"), cap("learning.view")),
  "/lectures/new": teaching,
  "/lectures/:id": learning,
  "/lectures/:id/edit": teaching,
  "/assignments/new": teaching,
  "/assignments/:id": learning,
  "/assignments/:id/edit": teaching,
  "/submissions/:id": either(role("teacher", "ta"), cap("learning.view")),
  "/grading": either(role("teacher", "ta"), cap("learning.manage")),
  "/tasks": student,
  "/me": student,
  "/me/status": student,
  "/results-office": either(role("results_officer"), cap("settings.manage")),
  "/academic": either(role("academic_affairs"), cap("settings.manage")),
  "/affairs": either(role("student_affairs"), cap("settings.manage")),
  "/notifications": anyone,
  "/notifications/new": canCompose as Allow,
  "/settings": anyone,
  "/install": anyone,
  "/results": student,
  "/results/search": cap("results.correct"),
  "/results/settings": cap("results.settings"),
  "/result-imports": cap("results.manage"),
  "/result-imports/:id": cap("results.manage"),
  "/result-corrections": cap("results.correct", "results.approve"),
  "/regulations": anyone,
  "/regulations/new": cap("regulations.manage"),
  "/regulations/:id": anyone,
  "/exams": learning,
  "/exams/new": teaching,
  "/exams/:id": learning,
  "/exams/:id/edit": teaching,
  "/exams/:id/monitor": either(role("teacher", "ta"), cap("learning.view")),
  "/exams/:id/stats": either(role("teacher", "ta"), cap("learning.view")),
  "/exam-attempts/:id": learning,
  "/exam-attempts/:id/result": learning,
  "/live": learning,
  "/live/new": teaching,
  "/announcements": anyone,
  "/announcements/new": announcers,
  "/inquiries": role("site_manager", "head_registrar", "registrar", "system_admin"),
  "/inquiries/:id": role("site_manager", "head_registrar", "registrar", "system_admin"),
  "/site": cap("content.manage"),
  "/site/pages/:id": cap("content.manage"),
  "/site/news/:id": cap("content.manage"),
  "/site/media": cap("content.manage"),
  "/site/redirects": cap("content.manage"),
  "/events": cap("events.manage"),
  "/events/:id": cap("events.manage"),
  "/applications": cap("admissions.view"),
  "/applications/:id": cap("admissions.view"),
  "/admissions/cycles": cap("admissions.manage"),
  "/admissions/forms": cap("admissions.review", "admissions.manage"),
  "/registrar": cap("admissions.review"),
  "/students": cap("students.view"),
  "/students/:id": cap("students.view"),
  "/student-imports": cap("students.import"),
  "/student-imports/:id": cap("students.import"),
  "/registrars": role("head_registrar", "system_admin"),
  "/department": departmentPages,
  "/department/courses": departmentPages,
  "/department/lectures": departmentPages,
  "/department/teachers": departmentPages,
  "/department/students": departmentPages,
  "/department/approvals": cap("registration.approve"),
  "/department/audit": cap("audit.view"),
  "/reports": cap("reports.department"),
  "/reports/admissions": cap("reports.admissions"),
  "/reports/affairs": cap("reports.affairs"),
  "/hr": cap("hr.view"),
  "/hr/teachers": cap("reports.teachers"),
  "/hr/teachers/:id": cap("reports.teachers"),
  "/hr/notices/new": cap("hr.notify"),
  "/hr/report": either(cap("hr.view"), cap("reports.teachers")),
  "/hr-notices/:id": either(role("teacher", "ta"), cap("hr.notify")),
  "/transcripts": cap("results.view"),
  "/print/report/:id": anyReport,
  "/print/transcript/:number": either(student, cap("results.view")),
  "/print/my-results": student,
  "/cases": cap("cases.view"),
  "/cases/new": cap("cases.manage"),
  "/cases/:id": cap("cases.view"),
  "/system": cap("settings.manage"),
  "/system/users": cap("users.view"),
  "/system/users/:id": cap("users.view"),
  "/system/structure": cap("structure.manage"),
  "/system/settings": cap("settings.manage"),
  "/audit": cap("audit.view"),
};
