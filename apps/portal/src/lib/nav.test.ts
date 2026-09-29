import { describe, expect, it } from "vitest";

import type { Me } from "./auth";
import { navFor } from "./nav";

const me = (roles: string[], extra: Partial<Me> = {}): Me =>
  ({
    public_id: "u",
    email: "u@ecst.test",
    full_name_ar: "مستخدم",
    roles: roles.map((role, id) => ({ id, role })),
    capabilities: {},
    creatable_roles: [],
    grantable_roles: [],
    student: null,
    ...extra,
  }) as unknown as Me;

// What the phone shows (desktop-only items live in the sidebar alone).
const labels = (m: Me) =>
  navFor(m, 0)
    .filter((i) => !i.desktopOnly)
    .map((i) => i.label);

describe("navFor", () => {
  it("keeps the department manager's sections in their original order (docs/02 D20)", () => {
    const sections = labels(me(["department_manager"])).slice(0, 8);
    expect(sections).toEqual([
      "الرئيسية",
      "المواد",
      "المحاضرات",
      "الأساتذة",
      "طلاب القسم",
      "التقارير",
      "النتائج",
      "سجل العمليات",
    ]);
  });

  it("gives the supervisor the same sections as the manager", () => {
    expect(labels(me(["department_supervisor"]))).toEqual(labels(me(["department_manager"])));
  });

  it("gives students exactly the five tabs", () => {
    const student = me(["student"], { student: { university_number: "26-IT-0001" } as never });
    expect(labels(student)).toEqual(["اليوم", "موادي", "المهام", "الإشعارات", "أنا"]);
  });

  it("gives the system admin short one-word tab labels", () => {
    const tabs = navFor(me(["system_admin"]), 0).slice(0, 4);
    expect(tabs.map((i) => i.short ?? i.label)).toEqual([
      "الرئيسية",
      "المستخدمون",
      "الهيكل",
      "الإعدادات",
    ]);
  });

  it("starts the teacher on Today, courses and grading", () => {
    expect(labels(me(["teacher"])).slice(0, 3)).toEqual(["اليوم", "موادي", "التصحيح"]);
  });

  it("shows the unread count on notifications", () => {
    const item = navFor(me(["teacher"]), 4).find((i) => i.to === "/notifications");
    expect(item?.badge).toBe(4);
  });

  it("never links two items to the same page, even with every capability", () => {
    const everything = new Proxy({}, { get: () => ({ everything: true, departments: [] }) });
    for (const roles of [["system_admin"], ["department_manager", "teacher"], ["head_registrar"]]) {
      const paths = navFor(me(roles, { capabilities: everything as never }), 0).map((i) => i.to);
      expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([]);
    }
  });
});

describe("admissions staff (review 2026-09-29)", () => {
  it("start on admissions, with applications before notifications", () => {
    const registrar = me(["registrar"], {
      capabilities: { "admissions.review": {}, "admissions.view": {} } as never,
    });
    const tabs = labels(registrar);
    expect(tabs.slice(0, 2)).toEqual(["القبول", "الطلبات"]);
    expect(tabs.indexOf("الطلبات")).toBeLessThan(tabs.indexOf("الإشعارات"));
    expect(tabs.filter((l) => l === "الطلبات")).toHaveLength(1);
  });
});
