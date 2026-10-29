import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it } from "vitest";

import { PageSearch, fold } from "./PageSearch";

afterEach(cleanup);

const nav = [
  { label: "الرئيسية", to: "/", icon: Users },
  { label: "المستخدمون", to: "/system/users", icon: Users, group: "النظام" },
  { label: "الإعدادات", to: "/system/settings", icon: Users, group: "النظام" },
  { label: "الطلبات", to: "/applications", icon: Users, group: "القبول" },
  { label: "التوثيق", to: "/api/docs", icon: Users, external: true },
];

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <PageSearch nav={nav} />
      <Routes>
        <Route path="*" element={null} />
        <Route path="/system/settings" element={<p>صفحة الإعدادات</p>} />
      </Routes>
    </MemoryRouter>,
  );

it("folds hamza forms and tāʾ marbūṭa", () => {
  expect(fold("الإعدادات")).toBe(fold("الاعدادات"));
  expect(fold("الكلية")).toBe(fold("الكليه"));
});

it("lists the pages whose name or group matches, never an outside link", () => {
  renderAt();
  const box = screen.getByRole("combobox", { name: "ابحث عن صفحة" });
  fireEvent.change(box, { target: { value: "النظام" } });
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
    "المستخدمونالنظام",
    "الإعداداتالنظام",
  ]);
  fireEvent.change(box, { target: { value: "التوثيق" } });
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(screen.getByText("لا صفحة بهذا الاسم.")).toBeTruthy();
});

it("opens the chosen page with the arrow keys and Enter", () => {
  renderAt();
  const box = screen.getByRole("combobox");
  fireEvent.change(box, { target: { value: "اعدادات" } });
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(screen.getByText("صفحة الإعدادات")).toBeTruthy();
  expect((box as HTMLInputElement).value).toBe("");
});
