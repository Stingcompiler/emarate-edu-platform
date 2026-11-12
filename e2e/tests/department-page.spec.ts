import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

// Review 2026-11-12: whoever creates a department appoints its head and supervisor, and each
// department opens on a page of its own (details, programmes, leadership, staff) — the lists
// stay names only. Checked at the phone and the desktop board sizes.

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function appoint(page: Page, label: string, search: string, name: string) {
  const card = page.locator(`[data-lead]`).filter({ hasText: label }).first();
  await card.getByRole("button", { name: new RegExp(`^تعيين ${label}`) }).click();
  await card.getByLabel(`ابحث عن ${label}`).fill(search);
  await card.getByRole("button", { name: new RegExp(name) }).click();
  await expect(card).toContainText(name);
  await expect(card).not.toContainText("لم يُعيَّن بعد");
}

// The «phone» (iPhone 13) and «desktop» (1280×800) projects run it at both board sizes.
test("the system admin creates a department and appoints its head and supervisor", async ({
  page,
}) => {
  const size = test.info().project.name;
  await signIn(page, "admin@demo.ecst.test");
  await page.goto("/system/structure");
  const code = size === "phone" ? "QAP" : "QAD";
  await page.getByPlaceholder("IT", { exact: true }).fill(code);
  await page.getByPlaceholder("اسم القسم", { exact: true }).fill(`قسم التجربة ${code}`);
  await page.getByPlaceholder("الاسم بالإنجليزية", { exact: true }).fill(`Trial ${code}`);
  await page.getByRole("button", { name: "إضافة القسم" }).click();
  await page.getByRole("link", { name: "عيّن مديره ومشرفه" }).click();
  await expect(page).toHaveURL(/\/departments\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`قسم التجربة ${code}`);
  await expect(page.locator("[data-lead]")).toHaveCount(2);
  await expect(page.locator("[data-lead]").first()).toContainText("لم يُعيَّن بعد");
  await noSideScroll(page);
  // From existing accounts only: the demo teacher heads it, the demo TA supervises it.
  await appoint(page, "مدير القسم", "سلمى", "د. سلمى الخضر");
  await appoint(page, "مشرف القسم", "ياسر", "م. ياسر عبد الباقي");
  await noSideScroll(page);
  await page.screenshot({
    path: test.info().outputPath(`department-page-${size}.png`),
    fullPage: true,
  });
});

test("academic affairs opens a department from its home and sees who leads and teaches there", async ({
  page,
}) => {
  await signIn(page, "academic@demo.ecst.test");
  await page.goto("/academic");
  await page.getByRole("link", { name: "تقنية المعلومات", exact: true }).first().click();
  await expect(page).toHaveURL(/\/departments\/\d+$/);
  const leads = page.locator("[data-lead]");
  await expect(leads.first()).toContainText("د. مصطفى الأمين");
  // Academic affairs appoints heads and supervisors (rbac.GRANTS).
  await expect(leads.first().getByRole("button", { name: /^تعيين مدير القسم/ })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("د. سلمى الخضر");
  await noSideScroll(page);
});

test("a department head reads their department's page but appoints nobody", async ({
  page,
  browser,
}) => {
  await signIn(page, "academic@demo.ecst.test");
  await page.goto("/academic");
  await page.getByRole("link", { name: "تقنية المعلومات", exact: true }).first().click();
  await expect(page).toHaveURL(/\/departments\/\d+$/);
  const it = new URL(page.url()).pathname;
  const head = await (
    await browser.newContext({ baseURL: test.info().project.use.baseURL })
  ).newPage();
  await signIn(head, "dept.manager@demo.ecst.test");
  await head.goto(it);
  await expect(head.locator("[data-lead]").first()).toContainText("د. مصطفى الأمين");
  await expect(head.getByRole("button", { name: /^تعيين/ })).toHaveCount(0);
});
