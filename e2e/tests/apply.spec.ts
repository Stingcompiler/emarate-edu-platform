import { expect, test } from "@playwright/test";

import { lastCode } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test("a visitor verifies the email, fills the application, uploads documents and submits", async ({
  page,
}, testInfo) => {
  const email = `applicant-${testInfo.project.name}-${Date.now()}@example.test`;
  // Arrives from «قدّم لهذا البرنامج» on the public programme page.
  await page.goto("/apply?program=BIT");

  // 1. Verify the email with a one-time code.
  await page.getByLabel("الاسم الكامل").fill("سلمى عثمان الأمين");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await page.getByLabel("رمز التحقق").fill(await lastCode(email));
  await page.getByRole("button", { name: "متابعة", exact: true }).click();

  // 2. Choose a programme.
  const chosen = page.getByRole("button", { name: /البرنامج الذي اخترته من الموقع/ });
  await expect(chosen).toContainText("بكالوريوس تقنية المعلومات");
  await expect(page.getByRole("button", { name: /بكالوريوس/ }).first()).toContainText(
    "البرنامج الذي اخترته",
  ); // listed first
  await chosen.click();

  // 3. The application form (default template).
  await expect(page.getByLabel("الاسم الكامل *")).toHaveValue("سلمى عثمان الأمين");
  await page.getByLabel("الهاتف").fill("+249912345678");
  await page.getByLabel("تاريخ الميلاد *").fill("2008-05-01");
  await page.getByLabel("نوع الشهادة *").selectOption("سودانية");
  await page.getByLabel("النسبة المئوية *").fill("82.5");
  await page.getByLabel("المدرسة").fill("مدرسة الخرطوم الثانوية");
  // The draft really is saved as the page says (review 2026-10-04 UX1): it survives a reload.
  await expect(page.getByText(/حُفظت المسودة/)).toBeVisible({ timeout: 8000 });
  await page.reload();
  await expect(page.getByLabel("المدرسة")).toHaveValue("مدرسة الخرطوم الثانوية");
  await expect(page.getByLabel("النسبة المئوية *")).toHaveValue("82.5");
  await page.getByRole("button", { name: "التالي: المستندات" }).click();

  // 4. Documents: the two required ones (a phone camera photo or a PDF).
  const files = page.locator('input[type="file"]');
  await files
    .nth(0)
    .setInputFiles({ name: "certificate.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("button", { name: "المراجعة (ينقص 1)" })).toBeVisible();
  await files
    .nth(1)
    .setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "التالي: المراجعة" }).click();

  // 5. Review shows what will be sent, then submit.
  await expect(page.getByText("مدرسة الخرطوم الثانوية")).toBeVisible();
  await expect(page.getByRole("heading", { name: "المستندات · 2" })).toBeVisible();
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByRole("heading", { name: "وصل طلبك، سلمى" })).toBeVisible();
  const reference = (await page.getByText(/^APP-\d{4}-\d+$/).textContent())!;

  // The applicant follows the application without an account (same verified session).
  await page.getByRole("button", { name: "متابعة طلبي" }).click();
  await expect(page).toHaveURL(/\/track/);
  await expect(page.getByText(reference)).toBeVisible();
});
