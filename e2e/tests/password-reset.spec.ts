import { expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./helpers";

// The administrator resets an account's password; the account must change the temporary one.
// It ends with the demo password again, so the other specs still sign this account in.
test("an admin resets a password and the account must choose its own", async ({
  page,
  browser,
}) => {
  await signIn(page, "admin@demo.ecst.test");
  const found = await page.request.get("/api/v1/users?search=events@demo.ecst.test");
  const target = (await found.json()).results[0] as { public_id: string; full_name_ar: string };

  await page.goto(`/system/users/${target.public_id}`);
  await page.getByRole("button", { name: "إعادة تعيين كلمة المرور" }).click();
  await page.getByRole("button", { name: "إعادة التعيين", exact: true }).click();
  const panel = page.getByRole("status").filter({ hasText: "كلمة المرور المؤقتة" });
  await expect(panel).toBeVisible();
  const temporary = (await panel.locator("bdi").first().innerText()).trim();
  expect(temporary).toHaveLength(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // The account's own browser: the old password is gone, the temporary one leads to the change page.
  const owner = await (await browser.newContext()).newPage();
  await owner.goto("/login");
  await owner.getByLabel("الرقم الجامعي أو البريد").fill("events@demo.ecst.test");
  await owner.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await owner.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(owner.getByText("غير صحيحة")).toBeVisible();

  await owner.getByLabel("كلمة المرور", { exact: true }).fill(temporary);
  await owner.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(owner).toHaveURL(/\/change-password/);
  await owner.goto("/"); // nothing else opens until it is changed
  await expect(owner).toHaveURL(/\/change-password/);

  await owner.getByLabel("كلمة المرور المؤقتة").fill(temporary);
  await owner.getByLabel("كلمة المرور الجديدة", { exact: true }).fill(PASSWORD);
  await owner.getByLabel("تأكيد كلمة المرور الجديدة").fill(PASSWORD);
  await owner.getByRole("button", { name: "حفظ كلمة المرور" }).click();
  await expect(owner).not.toHaveURL(/\/change-password/);
  await owner.close();
});
