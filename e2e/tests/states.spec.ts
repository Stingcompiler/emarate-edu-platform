import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// A list is only «empty» once its sources loaded (design review 2026-10-16, U07): while one
// is slow the page shows a placeholder, and when one fails it says so, with a retry. It must
// never tell the student nothing is scheduled when the request simply did not come back.
test.describe("student today: loading and failed sources", () => {
  test.skip(({ isMobile }) => isMobile, "one browser; the layout is the same");

  test("a slow source shows a placeholder, not the empty message", async ({ page }) => {
    await signIn(page, "26-IT-0001");
    await page.route("**/api/v1/exams**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    await page.goto("/");
    await expect(page.getByRole("status", { name: "جارٍ التحميل" }).first()).toBeVisible();
    await expect(page.getByText("لا شيء مجدول اليوم وغدًا.")).toHaveCount(0);
  });

  test("a failed source says so and offers a retry", async ({ page }) => {
    await signIn(page, "26-IT-0001");
    await page.route("**/api/v1/exams**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/");
    await expect(page.getByText("لا شيء مجدول اليوم وغدًا.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "أعد المحاولة" }).first()).toBeVisible();
  });
});
