import { expect, test } from "@playwright/test";

import { offscreen, signIn } from "./helpers";

// «الكوادر» in groups (owner, 2026-11-09): the site manager adds a group and a person with no
// account, then places them on the matrix — on a phone (cards and chips) and on a desktop
// (a table with a tick a cell).
test("the site manager adds a group and a person and sorts them on the matrix", async ({
  page,
}, info) => {
  const phone = (page.viewportSize()?.width ?? 1280) < 1024;
  await signIn(page, "site@demo.ecst.test");
  // Found from the sidebar, not only from a quick link (owner, 2026-11-09: «أين زر إضافة كادر؟»).
  if (!phone) await page.getByRole("link", { name: "تصنيف الكوادر" }).first().click();
  else await page.goto("/site-staff");
  await expect(page).toHaveURL(/\/site-staff$/);
  await expect(page.getByRole("heading", { name: "تصنيف الكوادر" })).toBeVisible();

  const group = `مجلس الأمناء ${info.project.name}`;
  await page.getByLabel("اسم التصنيف بالعربية").fill(group);
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(page.getByLabel(`اسم التصنيف «${group}»`)).toBeVisible();

  const person = `أ.د. عمر الأمين ${info.project.name}`;
  await page.getByRole("tab", { name: "شخص بلا حساب" }).click();
  await page.getByLabel("الاسم بالعربية").fill(person);
  await page.getByRole("button", { name: "إضافة إلى الصفحة" }).click();

  // Into «هيئة الإدارة» and the new group: a chip on phones, a tick on desktops.
  for (const name of ["هيئة الإدارة", group]) {
    const cell = page.getByLabel(`${person} في «${name}»`).locator("visible=true");
    await cell.click();
    if (phone) await expect(cell).toHaveAttribute("aria-pressed", "true");
    else await expect(cell).toBeChecked();
  }
  expect(await offscreen(page)).toEqual([]);
  if (phone) return;

  // A tick made while «تعديل» is open survives its «حفظ» (review 2026-11-09).
  await page
    .getByRole("row", { name: new RegExp(person) })
    .getByRole("button", { name: "تعديل" })
    .click();
  const tick = (name: string) => page.getByLabel(`${person} في «${name}»`).locator("visible=true");
  await tick("هيئة التدريس").click();
  await expect(tick("هيئة التدريس")).toBeChecked();
  const position = page.getByLabel("المسمّى في «هيئة الإدارة»").locator("visible=true");
  await position.fill("عميد الكلية");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(position).toHaveCount(0); // saved and closed
  await expect(tick("هيئة التدريس")).toBeChecked();
  await expect(tick(group)).toBeChecked();
});
