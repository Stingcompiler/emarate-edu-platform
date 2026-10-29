import { cleanup, render, screen } from "@testing-library/react";
import { ListChecks } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";

import { NextStepCard, Panel } from "./dashboard";

afterEach(cleanup);

it("a panel is a section named by its heading, with its «عرض الكل» link", () => {
  render(
    <MemoryRouter>
      <Panel
        title="مستحق اليوم والغد"
        icon={ListChecks}
        more={{ label: "كل المهام", to: "/tasks" }}
      >
        <p>صف</p>
      </Panel>
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "مستحق اليوم والغد" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "كل المهام" }).getAttribute("href")).toBe("/tasks");
});

it("the next step names the task and opens it", () => {
  render(
    <MemoryRouter>
      <NextStepCard
        title="تسليم: الواجب الأول"
        meta="مقدمة في البرمجة"
        tag="اليوم"
        action={{ label: "فتح الواجب", to: "/assignments/a1" }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole("region", { name: "يمكنك إنجازه الآن" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "تسليم: الواجب الأول" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "فتح الواجب" }).getAttribute("href")).toBe(
    "/assignments/a1",
  );
});
