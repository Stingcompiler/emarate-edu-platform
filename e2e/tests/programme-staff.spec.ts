import { expect, test, type Page } from "@playwright/test";

import { choose, signIn } from "./helpers";

// Owner, 2026-11-13: the department is a container. A course belongs to one programme, and a
// teacher is linked to programmes — as many as they teach in. The «phone» and «desktop»
// projects run these at both board sizes.

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("a department head links a teacher to a second programme", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "dept.manager@demo.ecst.test");
  await page.goto("/department/teachers");
  // The demo teacher teaches in the IT bachelor's; each project links her to another programme.
  const programme = size === "phone" ? "دبلوم تقنية المعلومات" : "بكالوريوس نظم المعلومات";
  const add = page
    .locator("div")
    .filter({ hasText: /^\+ إضافة عضو/ })
    .last();
  await choose(add.getByLabel("البرنامج"), programme);
  await add.getByLabel("ابحث بالاسم أو البريد").fill("سلمى");
  await add.getByRole("button", { name: /د\. سلمى الخضر/ }).click();
  // One row for her, naming both programmes.
  const row = page.getByRole("button", { name: /د\. سلمى الخضر/ }).first();
  await expect(row).toContainText("بكالوريوس تقنية المعلومات");
  await expect(row).toContainText(programme);
  await row.click();
  await expect(page.getByText("برامجه في القسم")).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({
    path: test.info().outputPath(`programme-staff-${size}.png`),
    fullPage: true,
  });
});

test("a new course is entered in one programme and shows it", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "dept.manager@demo.ecst.test");
  await page.goto("/department/courses");
  const form = page.locator("#new-offering");
  const code = size === "phone" ? "QP901" : "QD901";
  await form.getByLabel("رمز المادة").fill(code);
  await form.getByLabel("اسم المادة").fill(`مادة التجربة ${code}`);
  // Several programmes in the department: nothing is added until one is chosen.
  await expect(form.getByRole("button", { name: "إضافة" })).toBeDisabled();
  await choose(form.getByLabel("البرنامج"), "دبلوم تقنية المعلومات");
  await form.getByRole("button", { name: "إضافة" }).click();
  const added = page.getByRole("main").locator("div").filter({ hasText: code }).last();
  await expect(added).toContainText("دبلوم تقنية المعلومات");
  await noSideScroll(page);
  await page.screenshot({
    path: test.info().outputPath(`programme-course-${size}.png`),
    fullPage: true,
  });
});

// Every programme has its own head and supervisor, appointed by whoever appoints a
// department's — from existing accounts, on the user's page.
test("the system admin appoints a programme's head from an existing account", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "admin@demo.ecst.test");
  await page.goto("/system/users?role=ta");
  await page
    .getByRole("link", { name: /م\. ياسر عبد الباقي/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/system\/users\/[\w-]+$/);
  // The user's own page, not the list's «الدور» filter still on screen while it loads.
  await expect(page.getByText("+ إضافة دور أو نطاق")).toBeVisible();
  const programme = size === "phone" ? "دبلوم تقنية المعلومات" : "بكالوريوس نظم المعلومات";
  await choose(page.getByLabel("الدور", { exact: true }), "رئيس برنامج");
  await choose(page.getByLabel("البرنامج", { exact: true }), new RegExp(`^${programme}`));
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(page.getByRole("main")).toContainText(`البرنامج: ${programme}`);
  await noSideScroll(page);
});

// A programme's head works on the department's pages, narrowed to the programme.
test("a programme's head sees their programme and nothing of its siblings", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "program.manager@demo.ecst.test");
  await expect(page).toHaveURL(/\/department$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("بكالوريوس تقنية المعلومات");
  await expect(page.getByRole("main")).toContainText("البرنامج بالأرقام");
  await noSideScroll(page);
  await page.screenshot({
    path: test.info().outputPath(`programme-head-home-${size}.png`),
    fullPage: true,
  });
  await page.goto("/department/courses");
  const main = page.getByRole("main");
  await expect(main).toContainText("مقدمة في البرمجة"); // IT101, the IT bachelor's
  await expect(main).not.toContainText("مقدمة في نظم المعلومات"); // IS101, a sibling's
  await expect(main).not.toContainText("صيانة الحاسوب"); // DIT101, a sibling's
  await page.goto("/department/students");
  await expect(page.getByRole("main")).not.toContainText("نظم المعلومات");
  await noSideScroll(page);
});

test("a programme opens on its own page, where its head is appointed", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "academic@demo.ecst.test");
  // Programmes with no head of their own, in departments with no manager, wait on the home.
  await expect(page.getByRole("main")).toContainText("برامج بلا رئيس");
  await page.goto("/academic");
  await page.getByRole("link", { name: "علوم الحاسوب", exact: true }).first().click();
  const programme = size === "phone" ? "بكالوريوس علوم الحاسوب" : "بكالوريوس الذكاء الاصطناعي";
  await page.getByRole("link", { name: new RegExp(programme) }).click();
  await expect(page).toHaveURL(/\/programs\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(programme);
  const card = page.locator("[data-lead]").filter({ hasText: "رئيس البرنامج" }).first();
  await expect(card).toContainText("لم يُعيَّن بعد");
  await card.getByRole("button", { name: /^تعيين رئيس البرنامج/ }).click();
  await card.getByLabel("ابحث عن رئيس البرنامج").fill("سلمى");
  await card.getByRole("button", { name: /د\. سلمى الخضر/ }).click();
  await expect(card).toContainText("د. سلمى الخضر");
  await expect(card).not.toContainText("لم يُعيَّن بعد");
  await noSideScroll(page);
  await page.screenshot({
    path: test.info().outputPath(`programme-page-${size}.png`),
    fullPage: true,
  });
});

// Results files, the admissions report and the log are the programme's too.
test("a programme's head uploads results, and reads the admissions report and the log", async ({
  page,
}) => {
  await signIn(page, "program.manager@demo.ecst.test");
  await page.goto("/result-imports");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("رفع النتائج");
  // Their programme, never the department, is what the file is for.
  const form = page.locator("form");
  await expect(form.getByText("البرنامج", { exact: true })).toBeVisible();
  await expect(form.getByText("القسم", { exact: true })).toHaveCount(0);
  await expect(form).toContainText("بكالوريوس تقنية المعلومات");
  await noSideScroll(page);
  for (const [path, title] of [
    ["/reports/admissions", "القبول"],
    ["/department/audit", "سجل العمليات"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await expect(page.getByRole("main")).not.toContainText("غير مسموح");
    await noSideScroll(page);
  }
});
