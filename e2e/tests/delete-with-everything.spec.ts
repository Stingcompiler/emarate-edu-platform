import { type Page, expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./helpers";

// Owner, 2026-11-15: the system admin deletes students — many at once — and a department with
// everything they hold, after seeing what goes and confirming it. Each test makes what it
// deletes, so the demo the other tests read stays whole.

/** JSON API call with the signed-in session (setup and checks only). */
async function call(page: Page, method: string, url: string, body?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const res = await page.request.fetch(url, {
    method,
    headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status(), json: res.status() === 204 ? null : await res.json() };
}

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
}

test("the system admin picks the students a search shows and deletes them", async ({
  page,
}, info) => {
  await signIn(page, "admin@demo.ecst.test");
  const tag = `${info.project.name}${Date.now() % 100000}`;
  const programs = (await call(page, "GET", "/api/v1/programs?page_size=100")).json.results;
  const program = programs.find((p: { code: string }) => p.code === "BIT");
  for (const n of [1, 2]) {
    const made = await call(page, "POST", "/api/v1/students", {
      full_name_ar: `طالب للحذف ${tag} ${n}`,
      program: program.id,
      level: 1,
    });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
  }
  await page.goto("/students");
  await page.getByLabel("بحث بالاسم أو الرقم الجامعي").fill(`للحذف ${tag}`);
  const bar = page.locator("[data-bulk-delete]");
  await expect(bar.getByRole("button", { name: /تحديد كل نتائج التصفية \(2\)/ })).toBeVisible();
  await bar.getByRole("button", { name: /تحديد كل نتائج التصفية/ }).click();
  await bar.getByRole("button", { name: /حذف المحدَّدين \(2\)/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-deletion-counts]")).toContainText("طالب");
  await noSideScroll(page);
  await page.waitForTimeout(400); // the sheet has risen
  await page.screenshot({ path: info.outputPath(`delete-students-${info.project.name}.png`) });
  // A wrong confirmation deletes nothing.
  await dialog.getByLabel(/^اكتب «2» للتأكيد/).fill("3");
  await dialog.getByLabel("كلمة مرورك في المنصة").fill(PASSWORD);
  await dialog.getByRole("button", { name: "احذف نهائيًا" }).click();
  await expect(dialog.getByRole("alert")).toContainText("كما هو للتأكيد");
  await dialog.getByLabel(/^اكتب «2» للتأكيد/).fill("2");
  await dialog.getByRole("button", { name: "احذف نهائيًا" }).click();
  await expect(dialog).toContainText("حُذف ما يلي");
  await dialog.getByRole("button", { name: "إغلاق" }).click();
  await expect(page.getByText("لا نتائج.").locator("visible=true").first()).toBeVisible();
});

test("the system admin deletes a department with everything in it, after a backup", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await signIn(page, "admin@demo.ecst.test");
  const tag = `${info.project.name === "phone" ? "DP" : "DD"}${Date.now() % 10000}`;
  const college = (await call(page, "GET", "/api/v1/colleges")).json.results[0];
  const department = await call(page, "POST", "/api/v1/departments", {
    college: college.id,
    code: tag,
    name_ar: `قسم للحذف ${tag}`,
  });
  expect(department.status, JSON.stringify(department.json)).toBe(201);
  const program = await call(page, "POST", "/api/v1/programs", {
    department: department.json.id,
    code: `${tag}P`,
    name_ar: `برنامج ${tag}`,
    degree: "bachelor",
    levels_count: 4,
  });
  expect(program.status, JSON.stringify(program.json)).toBe(201);
  const student = await call(page, "POST", "/api/v1/students", {
    full_name_ar: `طالب في ${tag}`,
    program: program.json.id,
    level: 1,
  });
  expect(student.status, JSON.stringify(student.json)).toBe(201);

  await page.goto("/system/structure");
  await page.getByRole("button", { name: new RegExp(`^قسم للحذف ${tag}`) }).click();
  // The page lists every department: this one's own «تعديل القسم», beside its heading.
  await page
    .getByRole("heading", { name: new RegExp(`قسم للحذف ${tag} — البرامج`) })
    .locator("xpath=..")
    .getByRole("button", { name: "تعديل القسم" })
    .click();
  await page.getByRole("button", { name: "حذف القسم وكل ما فيه" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-deletion-counts]")).toContainText("برنامج");
  await expect(dialog).toContainText("نسخة احتياطية");
  await dialog.getByLabel(/للتأكيد$/).fill(`قسم للحذف ${tag}`);
  await dialog.getByLabel("كلمة مرورك في المنصة").fill(PASSWORD);
  await dialog.getByRole("button", { name: "احذف نهائيًا" }).click();
  await expect
    .poll(
      async () => (await call(page, "GET", `/api/v1/departments/${department.json.id}`)).status,
      {
        timeout: 90_000,
      },
    )
    .toBe(404);
});
