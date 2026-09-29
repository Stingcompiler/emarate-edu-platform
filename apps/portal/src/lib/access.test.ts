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
