import { Navigate } from "react-router";

import { useMe } from "../lib/auth";
import { can } from "../lib/nav";
import { Today } from "./learning/Today";

/** "/" lands on the role's home (docs/02 Phase 10). */
export function Home() {
  const me = useMe();
  if (me.isPending) return null;
  const m = me.data;
  if (m?.student) return <Today />;
  const roles = new Set(m?.roles.map((r) => r.role));
  const to =
    roles.has("teacher") || roles.has("ta")
      ? "/courses"
      : roles.has("department_manager") || roles.has("department_supervisor")
        ? "/reports"
        : roles.has("hr")
          ? "/hr"
          : can(m, "admissions.view")
            ? "/applications"
            : can(m, "results.manage")
              ? "/result-imports"
              : roles.has("student_affairs")
                ? "/cases"
                : can(m, "content.manage")
                  ? "/site"
                  : can(m, "events.manage")
                    ? "/events"
                    : roles.has("academic_affairs")
                      ? "/hr/teachers"
                      : roles.has("system_admin")
                        ? "/system"
                        : "/notifications";
  return <Navigate to={to} replace />;
}
