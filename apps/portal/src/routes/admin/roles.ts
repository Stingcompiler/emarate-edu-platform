export const ROLE_LABEL: Record<string, string> = {
  system_admin: "مدير النظام",
  head_registrar: "مسؤول المسجلين",
  registrar: "مسجل",
  results_officer: "مسؤول النتائج",
  academic_affairs: "أمين الشؤون العلمية",
  student_affairs: "أمين شؤون الطلاب",
  department_manager: "مدير قسم",
  department_supervisor: "مشرف قسم",
  teacher: "أستاذ",
  ta: "معيد",
  hr: "الموارد البشرية",
  site_manager: "مدير الموقع",
  events_manager: "مدير الفعاليات",
  student: "طالب",
};
/** Roles whose assignment names a department (docs/03 §2) — mirrors rbac.DEPARTMENT_SCOPED_ROLES.
 * Teachers and TAs are college-wide accounts; a department manager adds them as members. */
export const DEPARTMENT_ROLES = new Set([
  "registrar",
  "department_manager",
  "department_supervisor",
]);

/** Grantable roles from the least to the most privileged — «مدير النظام» last, never
 *  preselected (review 2026-09-29). */
export const ROLE_ORDER = [
  "ta",
  "teacher",
  "events_manager",
  "site_manager",
  "hr",
  "registrar",
  "department_supervisor",
  "department_manager",
  "student_affairs",
  "results_officer",
  "academic_affairs",
  "head_registrar",
  "system_admin",
];
