import { cleanup, render } from "@testing-library/react";
import { Users } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";

import { SidebarItems } from "./AppShell";

afterEach(cleanup);

const nav = [
  { label: "الرئيسية", to: "/", icon: Users },
  { label: "المستخدمون", to: "/system/users", icon: Users, group: "النظام" },
  { label: "الإعدادات", to: "/system/settings", icon: Users, group: "النظام" },
  { label: "الطلبات", to: "/applications", icon: Users, group: "القبول" },
  { label: "الدورات", to: "/admissions/cycles", icon: Users, group: "القبول" },
  { label: "الاختبارات", to: "/exams", icon: Users, group: "الأكاديمي" },
];

const openGroups = (path: string) => {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarItems nav={nav} />
    </MemoryRouter>,
  );
  return [...container.querySelectorAll("details")].map((d) => [
    d.querySelector("summary")?.textContent,
    d.open,
  ]);
};

it("long menus are folded: only the group of the page shown is open (design review B10)", () => {
  expect(openGroups("/applications")).toEqual([
    ["النظام", false],
    ["القبول", true],
    ["الأكاديمي", false],
  ]);
});

it("a detail page counts as its list's group, and items without a group stay flat", () => {
  expect(openGroups("/system/users/abc")).toEqual([
    ["النظام", true],
    ["القبول", false],
    ["الأكاديمي", false],
  ]);
});
