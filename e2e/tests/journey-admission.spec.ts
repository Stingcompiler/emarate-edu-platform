import { type Page, expect, test } from "@playwright/test";

import { choose, lastCode, signIn } from "./helpers";

// Review 2026-11-10 §3, «مسجل ومسؤول قبول وقسم»: one application from the visitor's first
// screen to a student record, and back to the visitor. Each side checks what the other did,
// after a reload (the result is stored, not only shown).
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function apply(page: Page, email: string, name: string): Promise<string> {
  await page.goto("/apply?program=BIT");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await page.getByLabel("رمز التحقق").fill(await lastCode(email));
  await page.getByLabel(/الاسم الكامل/).fill(name);
  await page.getByRole("button", { name: "متابعة", exact: true }).click();
  await page.getByRole("button", { name: /البرنامج الذي اخترته من الموقع/ }).click();
  await page.getByLabel("الهاتف").fill("+249912345671");
  await page.getByLabel(/^تاريخ الميلاد/).fill("2008-03-14");
  await choose(page.getByLabel(/^نوع الشهادة/), "سودانية");
  await page.getByLabel(/^النسبة المئوية/).fill("88");
  await expect(page.getByText(/محفوظة على الخادم/)).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "التالي: المستندات" }).click();
  const files = page.locator('input[type="file"]');
  for (const [i, file] of ["certificate.pdf", "passport.pdf"].entries())
    await files.nth(i).setInputFiles({ name: file, mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "التالي: المراجعة" }).click();
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByRole("heading", { name: /^وصل طلبك/ })).toBeVisible();
  return (await page.getByText(/^APP-\d{4}-\d+$/).textContent())!;
}

test("an application goes from the visitor to a student record, and the visitor sees it", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const email = `journey-${stamp}@example.test`;
  const name = info.project.name === "phone" ? "رحاب عمر الطيب" : "منيرة صالح الحسن";
  const reference = await apply(page, email, name);

  // The head registrar takes it from «الطلبات» through review to acceptance.
  const staff = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: page.viewportSize(),
    locale: "ar",
  });
  const desk = await staff.newPage();
  await signIn(desk, "head.registrar@demo.ecst.test");
  await desk.goto("/applications");
  await desk.getByLabel("الرقم المرجعي أو الاسم أو البريد").fill(reference);
  await desk
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await expect(desk.getByRole("heading", { name, level: 1 })).toBeVisible();
  for (const step of ["بدء المراجعة", "مؤهل", "قبول"]) {
    const updated = desk.waitForResponse(
      (r) => r.url().endsWith("/transition") && r.request().method() === "POST",
    );
    await desk.locator("aside").getByRole("button", { name: step, exact: true }).click();
    if (step === "قبول")
      await desk
        .getByRole("alertdialog")
        .getByRole("button", { name: "قبول", exact: true })
        .click();
    expect((await updated).status(), step).toBe(200);
  }
  await desk.reload();
  await expect(
    desk.getByText("مقبول", { exact: true }).locator("visible=true").first(),
  ).toBeVisible();

  // Registered: the page shows the new university number, and the record carries it.
  await desk.getByRole("button", { name: "تحويل إلى طالب وإصدار الرقم الجامعي" }).click();
  const number = desk
    .getByText(/^\d{2}-[A-Z]+-\d{4}$/)
    .locator("visible=true")
    .first();
  await expect(number).toBeVisible();
  const universityNumber = (await number.textContent())!.trim();
  await desk.goto("/students");
  await desk.getByLabel("بحث بالاسم أو الرقم الجامعي").fill(universityNumber);
  await expect(desk.getByText(name).locator("visible=true").first()).toBeVisible();
  await expect(
    desk
      .getByText(/تقنية المعلومات/)
      .locator("visible=true")
      .first(),
  ).toBeVisible();
  await staff.close();

  // The visitor, on «متابعة طلبي», reads the outcome after a reload.
  await page.getByRole("button", { name: "متابعة طلبي" }).click();
  await expect(page).toHaveURL(/\/track/);
  await page.reload();
  await expect(page.getByText(reference).locator("visible=true").first()).toBeVisible();
  await expect(
    page
      .getByText(/سُجّل طالبًا|مقبول/)
      .locator("visible=true")
      .first(),
  ).toBeVisible();
});
