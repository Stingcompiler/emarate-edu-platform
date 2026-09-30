import { expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./helpers";

test("a student signs in with the university number and lands on Today", async ({ page }) => {
  await signIn(page, "26-IT-0001");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("محمد");
  await expect(page.getByText("مستحق اليوم والغد")).toBeVisible();
});

test("a wrong password shows an Arabic error and stays on login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("الرقم الجامعي أو البريد").fill("26-IT-0001");
  await page.getByLabel("كلمة المرور", { exact: true }).fill(`${PASSWORD}-wrong`);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("غير صحيحة")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("staff land on their role's home", async ({ page }) => {
  await signIn(page, "dept.manager@demo.ecst.test");
  await expect(page).toHaveURL("/department");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("قسم");
});
