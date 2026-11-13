import { Navigate } from "react-router";

import { hasRole, useMe } from "../lib/auth";
import { can } from "../lib/nav";
import { TeacherToday } from "./learning/TeacherToday";
import { Today } from "./learning/Today";

/** "/" lands on the role's home (docs/02 Phase 10): students and teachers get
 *  their "today" page; other roles open their main workspace. */
export function Home() {
  const me = useMe();
  if (me.isPending) return null;
  const m = me.data;
  if (m?.student) return <Today />;
  if (hasRole(m, "teacher", "ta")) return <TeacherToday />;
  const rules: [boolean, string][] = [
    [hasRole(m, "system_admin", "system_supervisor"), "/system"],
    [hasRole(m, "department_manager", "department_supervisor"), "/department"],
    [hasRole(m, "hr"), "/hr"],
    // Whoever reviews applications (a programme's head only reads those to the programme).
    [can(m, "admissions.review"), "/registrar"],
    [hasRole(m, "results_officer"), "/results-office"],
    [hasRole(m, "student_affairs"), "/affairs"],
    [can(m, "content.manage"), "/site"],
    [can(m, "events.manage"), "/events"],
    [hasRole(m, "academic_affairs"), "/academic"],
    // A programme's head or supervisor, when no college-wide role comes first (owner,
    // 2026-11-13): the department's home, about their programme.
    [hasRole(m, "program_manager", "program_supervisor"), "/department"],
  ];
  const to = rules.find(([ok]) => ok)?.[1] ?? "/notifications";
  return <Navigate to={to} replace />;
}
