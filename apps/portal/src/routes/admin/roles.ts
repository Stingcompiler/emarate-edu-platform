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
/** Roles whose assignment names a department (docs/03 §2). */
export const DEPARTMENT_ROLES = new Set([
  "registrar",
  "department_manager",
  "department_supervisor",
  "teacher",
  "ta",
]);
