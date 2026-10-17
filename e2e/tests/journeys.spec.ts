import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// The closing test of the design review (2026-10-16): a person arrives with a goal and gets
// there, on the phone and on a desktop, without a placeholder or an empty message standing in
// for data that was not loaded. Page loading alone is not the measure.
const SITE = process.env.E2E_SITE_URL ?? "http://localhost:4322";

test.describe("journeys", () => {
  test("a visitor finds a programme's conditions and reaches the application", async ({ page }) => {
    await page.goto(`${SITE}/ar/programs/BIT/`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("تقنية المعلومات");
    // Duration, hours, conditions and fees are on the page, not behind a click.
    await expect(page.getByRole("region", { name: "أساسيات المتقدم" })).toBeVisible();
    await page
      .getByRole("region", { name: "أساسيات المتقدم" })
      .getByRole("link", { name: "قدّم لهذا البرنامج" })
      .click();
    await expect(page).toHaveURL(/\/apply\?program=BIT/);
  });

  test("a student returns to the portal and sees what is due, with a way to all tasks", async ({
    page,
  }) => {
    await signIn(page, "26-IT-0001");
    await expect(page.getByRole("heading", { name: "مستحق اليوم والغد" })).toBeVisible();
    // Nothing is still loading, and the section says something real: a task or «nothing».
    await expect(page.getByRole("status", { name: "جارٍ التحميل" })).toHaveCount(0);
    const due = page.locator("section").filter({ hasText: "مستحق اليوم والغد" });
    await expect(due.getByRole("link").or(due.getByText("لا شيء مجدول"))).not.toHaveCount(0);
    await page.getByRole("link", { name: "كل المهام" }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole("heading", { name: "المهام" })).toBeVisible();
  });

  test("a teacher reaches the grading queue from today", async ({ page }) => {
    await signIn(page, "teacher@demo.ecst.test");
    await expect(page.getByRole("heading", { name: "طابور التصحيح" })).toBeVisible();
    await expect(page.getByText("جارٍ التحميل…")).toHaveCount(0);
    // The queue card is one link to the grading page, whatever is waiting.
    await page.locator("main").locator('a[href="/grading"]').first().click();
    await expect(page).toHaveURL(/\/grading$/);
    await expect(page.getByRole("heading", { name: "التصحيح" })).toBeVisible();
  });

  test("a registrar finds what needs a decision and opens it", async ({ page }) => {
    await signIn(page, "registrar@demo.ecst.test");
    const inbox = page.locator("section, div").filter({ hasText: "يحتاج إجراءك" }).first();
    await expect(inbox).toBeVisible();
    await expect(page.getByRole("status", { name: "جارٍ التحميل" })).toHaveCount(0);
    // The first row of the inbox carries the primary action; following it opens the work.
    const first = page
      .locator("main")
      .locator('a[href^="/applications"], a[href="/inquiries"], a[href^="/department/approvals"]')
      .first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).not.toHaveURL(/\/$/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
