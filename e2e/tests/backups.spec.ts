import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { offscreen, PASSWORD, signIn } from "./helpers";

// «النسخ الاحتياطية» (owner, 2026-11-14): a copy is made, then downloaded as one file under a
// password typed in the dialog, and a copy is restored over the platform. The «phone» and
// «desktop» projects run these at both sizes.

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

// The whole way round: a copy, a change after it, the restore, and the change is gone — while
// the state the restore replaced is itself kept as a copy.
test("the system admin restores a copy and what came after it is gone", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "admin@demo.ecst.test");
  await page.goto("/system/settings");
  const section = page.locator("section", { has: page.locator("#backups") });
  const lectures = page.getByLabel("المحاضرات المخططة أسبوعيًا لكل مادة");
  const before = await lectures.inputValue();
  const rows = section.locator("[data-backup]");
  // The newest copy before this one, if any (older ones are pruned, so rows are not counted).
  await expect(section.getByRole("list")).toHaveAttribute("aria-busy", "false");
  const newest = (await rows.count()) ? await rows.first().getAttribute("data-backup") : null;
  await section.getByRole("button", { name: "إنشاء نسخة الآن" }).click();
  await page.getByRole("button", { name: "إنشاء النسخة" }).click();
  await expect
    .poll(async () => ((await rows.count()) ? rows.first().getAttribute("data-backup") : null), {
      timeout: 30_000,
    })
    .not.toBe(newest);
  const copy = await rows.first().getAttribute("data-backup");

  // After the copy: a setting is changed and saved.
  const changed = String(Number(before) + 3);
  await lectures.fill(changed);
  await page.getByRole("button", { name: "حفظ الإعدادات" }).click();
  await expect(page.getByText("حُفظت الإعدادات")).toBeVisible();

  await rows
    .first()
    .getByRole("button", { name: /^استعادة نسخة/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("كل ما أُدخل بعدها يُمحى");
  await expect(dialog.getByRole("columnheader", { name: "في النسخة" })).toBeVisible();
  expect(await offscreen(page)).toEqual([]);
  await page.waitForTimeout(400); // the sheet has risen
  await page.screenshot({ path: test.info().outputPath(`backup-restore-${size}.png`) });

  // Neither a click alone nor a wrong password restores anything.
  await dialog.getByRole("button", { name: "استعادة النسخة" }).click();
  await expect(dialog.getByRole("alert")).toContainText("اكتب كلمة «استعادة»");
  await dialog.getByLabel(/^اكتب كلمة «استعادة»/).fill("استعادة");
  await dialog.getByLabel("كلمة مرورك في المنصة").fill("not-my-password");
  await dialog.getByRole("button", { name: "استعادة النسخة" }).click();
  await expect(dialog.getByRole("alert")).toContainText("كلمة المرور غير صحيحة");
  await expect(lectures).toHaveValue(changed);

  await dialog.getByLabel("كلمة مرورك في المنصة").fill(PASSWORD);
  await dialog.getByRole("button", { name: "استعادة النسخة" }).click();
  // The page opens again on the restored rows and says what happened.
  await expect(page.getByLabel("المحاضرات المخططة أسبوعيًا لكل مادة")).toHaveValue(before, {
    timeout: 60_000,
  });
  const done = section.locator('[data-restore="done"]');
  await expect(done).toContainText("الوضع الذي كان قبل الاستعادة محفوظ");
  // The copy that was restored is still there, and above it the state it replaced.
  await expect(section.locator(`[data-backup="${copy}"]`)).toBeVisible();
  expect(await rows.first().getAttribute("data-backup")).not.toBe(copy);
  expect(await offscreen(page)).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath(`backup-restored-${size}.png`),
    fullPage: true,
  });

  await page.goto("/audit");
  await expect(page.getByRole("main")).toContainText("استعاد نسخة احتياطية");
});

// While the platform is closed the API answers 503 «maintenance» to everyone; the portal puts
// its waiting screen over the page and opens the page again by itself. (In these tests a
// restore runs inside its own request, so the closed platform is played by the network here;
// the middleware itself is tested in backend/core/tests/test_restore.py.)
test("everyone sees the waiting screen while a restore runs", async ({ page }) => {
  const size = test.info().project.name;
  await signIn(page, "teacher@demo.ecst.test");
  let closed = true;
  await page.route("**/api/public/maintenance", (route) =>
    route.fulfill({ json: { maintenance: closed } }),
  );
  await page.route("**/api/v1/**", (route) =>
    closed
      ? route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({ status: 503, code: "maintenance", detail: "تُستعاد نسخة." }),
        })
      : route.continue(),
  );
  await page.reload();
  const screen = page.getByRole("alertdialog");
  await expect(screen).toContainText("المنصة في صيانة قصيرة");
  expect(await offscreen(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`maintenance-${size}.png`) });
  closed = false;
  // It asks every few seconds, then loads the page again.
  await expect(screen).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
