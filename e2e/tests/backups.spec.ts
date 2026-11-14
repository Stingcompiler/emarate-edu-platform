import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { offscreen, PASSWORD, signIn } from "./helpers";

// «النسخ الاحتياطية» (owner, 2026-11-14): a copy is made, then downloaded as one file under a
// password typed in the dialog. The «phone» and «desktop» projects run this at both sizes.

const FILE_PASSWORD = "e2e-backup-file-2026";

test("the system admin makes a copy and downloads it as one file", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "admin@demo.ecst.test");
  await page.goto("/system/settings");
  const section = page.locator("section", { has: page.locator("#backups") });
  await section.getByRole("button", { name: "إنشاء نسخة الآن" }).click();
  await page.getByRole("button", { name: "إنشاء النسخة" }).click();
  const row = section.locator("[data-backup]").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  // What the platform held when the copy was made.
  await expect(row).toContainText("قاعدة البيانات");
  await expect(row).toContainText("طالب");
  expect(await offscreen(page)).toEqual([]);

  await row.getByRole("button", { name: /^تنزيل نسخة/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("بدونها لا يُفتح الملف");
  expect(await offscreen(page)).toEqual([]);
  await page.waitForTimeout(400); // the sheet has risen
  await page.screenshot({ path: test.info().outputPath(`backup-download-${size}.png`) });

  // A short file password, then two that differ, are caught before anything is asked.
  await dialog.getByLabel(/^كلمة سر الملف/).fill("short");
  await dialog.getByRole("button", { name: "تنزيل الملف" }).click();
  await expect(dialog.getByRole("alert")).toContainText("10 أحرف على الأقل");
  await dialog.getByLabel(/^كلمة سر الملف/).fill(FILE_PASSWORD);
  await dialog.getByLabel("أعد كتابة كلمة سر الملف").fill(`${FILE_PASSWORD}-x`);
  await dialog.getByRole("button", { name: "تنزيل الملف" }).click();
  await expect(dialog.getByRole("alert")).toContainText("غير متطابقتين");
  await dialog.getByLabel("أعد كتابة كلمة سر الملف").fill(FILE_PASSWORD);

  // The admin's own password, wrong and then right.
  await dialog.getByLabel("كلمة مرورك في المنصة").fill("not-my-password");
  await dialog.getByRole("button", { name: "تنزيل الملف" }).click();
  await expect(dialog.getByRole("alert")).toContainText("كلمة المرور غير صحيحة");
  await dialog.getByLabel("كلمة مرورك في المنصة").fill(PASSWORD);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "تنزيل الملف" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^ecst-backup-\d{8}T\d{6}Z\.ecstbak$/);
  const file = await readFile(await download.path());
  expect(file.subarray(0, 8).toString()).toBe("ECSTPKG1");
  // Encrypted: nothing of the database reads in it.
  expect(file.includes("SQLite format 3")).toBe(false);
  expect(file.includes("demo.ecst.test")).toBe(false);
  await expect(dialog).toHaveCount(0);

  // On the record.
  await page.goto("/audit");
  await expect(page.getByRole("main")).toContainText("نزّل نسخة احتياطية كاملة");
});

test("the system supervisor sees the copies but downloads none", async ({ page }) => {
  await signIn(page, "supervisor@demo.ecst.test");
  await page.goto("/system/settings");
  const section = page.locator("section", { has: page.locator("#backups") });
  await section.getByRole("button", { name: "إنشاء نسخة الآن" }).click();
  await page.getByRole("button", { name: "إنشاء النسخة" }).click();
  await expect(section.locator("[data-backup]").first()).toBeVisible({ timeout: 30_000 });
  await expect(section.getByRole("button", { name: /^تنزيل/ })).toHaveCount(0);
});
