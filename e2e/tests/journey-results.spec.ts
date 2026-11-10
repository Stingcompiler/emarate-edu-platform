import { type Page, expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Review 2026-11-10 §3, «النتائج»: what the results office publishes is what the student reads,
// and what it takes back leaves the student's page. Each side reloads before it checks.

/** The course codes of the student's published results, read from the API the page uses. */
async function myCourses(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/v1/me/results");
  expect(res.ok()).toBe(true);
  const codes: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.course_code === "string") codes.push(o.course_code);
      Object.values(o).forEach(walk);
    }
  };
  walk(await res.json());
  return [...new Set(codes)];
}

test("results the office publishes are what the student reads, and unpublished they leave", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  await signIn(page, "26-IT-0001");
  const before = await myCourses(page);
  expect(before.length, "the demo batch gives the student results").toBeGreaterThan(0);
  const course = before[0]!;
  await page.goto("/results");
  await expect(page.getByText(course).locator("visible=true").first()).toBeVisible();

  const staff = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: page.viewportSize(),
    locale: "ar",
  });
  const office = await staff.newPage();
  await signIn(office, "results@demo.ecst.test");
  await office.goto("/result-imports");
  await office
    .getByRole("link", { name: /نتائج تقنية المعلومات — المستوى الأول/ })
    .locator("visible=true")
    .first()
    .click();
  try {
    await office.getByRole("button", { name: "إلغاء النشر" }).click();
    await office.getByRole("alertdialog").getByRole("button", { name: "إلغاء النشر" }).click();
    await expect(office.getByRole("button", { name: "نشر للطلاب" })).toBeVisible();
    await office.reload();
    await expect(office.getByRole("button", { name: "نشر للطلاب" })).toBeVisible();

    await page.reload();
    await expect(page.getByText(course)).toHaveCount(0);
    expect(await myCourses(page)).not.toContain(course);
  } finally {
    // Published again whatever happened above: the demo data stays as the other tests expect.
    const publish = office.getByRole("button", { name: "نشر للطلاب" });
    if (await publish.isVisible()) await publish.click();
    await expect(office.getByRole("button", { name: "إلغاء النشر" })).toBeVisible();
  }
  await staff.close();

  await page.reload();
  await expect(page.getByText(course).locator("visible=true").first()).toBeVisible();
  expect(await myCourses(page)).toEqual(before);
});
