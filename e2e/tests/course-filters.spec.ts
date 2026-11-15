import { expect, test, type Page } from "@playwright/test";

import { choose, signIn } from "./helpers";

// Owner, 2026-11-15: inside a department's courses and lectures, the programme, then its level,
// then the semester. Kept in the address. The «phone» and «desktop» projects run both sizes.

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
}

async function shownLevels(page: Page) {
  return page
    .locator("[data-level]:visible")
    .evaluateAll((rows) =>
      rows.map((r) => `${r.getAttribute("data-level")}/${r.getAttribute("data-semester")}`),
    );
}

test("the department's courses narrow to a programme, a level and a semester", async ({ page }) => {
  await signIn(page, "dept.manager@demo.ecst.test");
  await page.goto("/department/courses");
  const filter = page.locator("[data-program-filter]");
  await expect(filter.getByRole("combobox", { name: "المستوى" })).toBeVisible();
  await expect(page.locator("[data-level]").first()).toBeVisible({ timeout: 30_000 });
  const before = await page.locator("[data-level]").count();

  await choose(filter.getByRole("combobox", { name: "المستوى" }), "المستوى 1");
  await expect(page).toHaveURL(/level=1/);
  const levelOne = await shownLevels(page);
  expect(levelOne.length).toBeGreaterThan(0);
  expect(levelOne.every((s) => s.startsWith("1/"))).toBe(true);
  expect(levelOne.length).toBeLessThanOrEqual(before);

  await choose(filter.getByRole("combobox", { name: "الفصل الدراسي" }), "الفصل الدراسي الأول");
  await expect(page).toHaveURL(/semester=1/);
  const firstSemester = await shownLevels(page);
  expect(firstSemester.length).toBeGreaterThan(0);
  expect(firstSemester.every((s) => s === "1/1")).toBe(true);
  await noSideScroll(page);

  // Opened again, the page shows the same list.
  await page.reload();
  await expect(filter.getByRole("combobox", { name: "المستوى" })).toContainText("المستوى 1");
  await expect(page.locator("[data-level]").first()).toBeVisible();
  expect(await shownLevels(page)).toEqual(firstSemester);
  await page.screenshot({
    path: test.info().outputPath(`course-filters-${test.info().project.name}.png`),
  });
});

test("the department's lectures narrow the same way", async ({ page }) => {
  await signIn(page, "dept.manager@demo.ecst.test");
  await page.goto("/department/lectures?level=1");
  const filter = page.locator("[data-program-filter]");
  await expect(filter.getByRole("combobox", { name: "المستوى" })).toContainText("المستوى 1");
  await expect(page.locator("[data-level]").first()).toBeVisible({ timeout: 30_000 });
  const shown = await shownLevels(page);
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.every((s) => s.startsWith("1/"))).toBe(true);
  await noSideScroll(page);
});
