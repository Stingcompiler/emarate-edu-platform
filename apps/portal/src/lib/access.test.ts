import { describe, expect, it } from "vitest";

import type { Me } from "./auth";
import main from "../main.tsx?raw";
import { ROUTE_ACCESS } from "./access";

const guarded = [...main.matchAll(/signedIn\([^,]+, "([^"]+)"\)/g)].map((m) => m[1]!);

const me = (roles: string[], capabilities: Record<string, unknown> = {}, student = false): Me =>
  ({
    roles: roles.map((role, id) => ({ id, role })),
    capabilities,
    student: student ? { university_number: "26-IT-0001" } : null,
  }) as unknown as Me;

describe("route access (review 2026-09-29, P2)", () => {
  it("gives every signed-in page an audience", () => {
    expect(guarded.length).toBeGreaterThan(80);
    expect(guarded.filter((path) => !ROUTE_ACCESS[path])).toEqual([]);
  });

  it("keeps a student out of staff pages and in their own", () => {
    const s = me(["student"], {}, true);
    expect(ROUTE_ACCESS["/system/users"]!(s)).toBe(false);
    expect(ROUTE_ACCESS["/department"]!(s)).toBe(false);
    expect(ROUTE_ACCESS["/regulations/new"]!(s)).toBe(false);
    expect(ROUTE_ACCESS["/results-office"]!(s)).toBe(false);
    expect(ROUTE_ACCESS["/results"]!(s)).toBe(true);
    expect(ROUTE_ACCESS["/tasks"]!(s)).toBe(true);
    expect(ROUTE_ACCESS["/exams/:id"]!(s)).toBe(true);
  });

  it("follows capabilities for department roles", () => {
    const manager = me(["department_manager"], { "learning.manage": {}, "reports.department": {} });
    expect(ROUTE_ACCESS["/department/courses"]!(manager)).toBe(true);
    expect(ROUTE_ACCESS["/lectures/new"]!(manager)).toBe(true);
    expect(ROUTE_ACCESS["/reports"]!(manager)).toBe(true);
    expect(ROUTE_ACCESS["/system/settings"]!(manager)).toBe(false);
  });
});

/** Every page a server notification opens (backend `action_url=`: notifications/events.py,
 *  exams, inquiries, admissions, student_affairs, live, results). Owner 2026-11-01: a lecture
 *  notification opened «الصفحة غير موجودة». Add the new shape here when the server adds one. */
const NOTIFICATION_LINKS = [
  "/lectures/L1",
  "/assignments/A1",
  "/courses/C1",
  "/department/approvals",
  "/",
  "/hr-notices/N1",
  "/hr/teachers/T1",
  "/exams/E1",
  "/inquiries/I1",
  "/applications/P1",
  "/regulations/R1",
  "/me/status",
  "/cases",
  "/live",
  "/results",
];

describe("notification links", () => {
  it.each(NOTIFICATION_LINKS)("%s is a portal page", (link) => {
    const routes = Object.keys(ROUTE_ACCESS).map(
      (r) => new RegExp(`^${r.replace(/:[^/]+/g, "[^/]+")}$`),
    );
    expect(routes.some((r) => r.test(link))).toBe(true);
  });
});
