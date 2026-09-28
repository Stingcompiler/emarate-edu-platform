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
    [hasRole(m, "system_admin"), "/system"],
    [hasRole(m, "department_manager", "department_supervisor"), "/department"],
    [hasRole(m, "hr"), "/hr"],
    [can(m, "admissions.view"), "/registrar"],
    [hasRole(m, "results_officer"), "/results-office"],
    [hasRole(m, "student_affairs"), "/affairs"],
    [can(m, "content.manage"), "/site"],
    [can(m, "events.manage"), "/events"],
    [hasRole(m, "academic_affairs"), "/academic"],
  ];
  const to = rules.find(([ok]) => ok)?.[1] ?? "/notifications";
  return <Navigate to={to} replace />;
}
