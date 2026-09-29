import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Review 2026-09-29 (P2): a page outside the role's audience says so — no zeros, no forms the
// server would refuse.
test("a student opening staff pages sees «غير مسموح», not empty dashboards", async ({ page }) => {
  await signIn(page, "26-IT-0001");
  for (const path of ["/system/users", "/department", "/results-office", "/regulations/new"]) {
    await page.goto(path);
    await expect(page.getByText("هذه الصفحة ليست ضمن صلاحياتك")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("غير مسموح");
  }
  // Their own pages still open.
  await page.goto("/results");
  await expect(page.getByText("هذه الصفحة ليست ضمن صلاحياتك")).toHaveCount(0);
});
