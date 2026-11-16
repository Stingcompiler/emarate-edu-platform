import { type Page, expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./helpers";

// Owner, 2026-11-15: a department's head asks to delete students with everything they hold; the
// system admin alone approves — through the deletion itself — and the head sees it decided.

async function call(page: Page, method: string, url: string, body?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const res = await page.request.fetch(url, {
    method,
    headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status(), json: res.status() === 204 ? null : await res.json() };
}

test("a head asks to delete two students and the system admin approves it", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const tag = `${info.project.name}${Date.now() % 100000}`;
  await signIn(page, "dept.manager@demo.ecst.test");
  const programs = (await call(page, "GET", "/api/v1/programs?page_size=100")).json.results;
  const program = programs.find((p: { code: string }) => p.code === "BIT");
  for (const n of [1, 2]) {
    const made = await call(page, "POST", "/api/v1/students", {
      full_name_ar: `طلب حذف ${tag} ${n}`,
      program: program.id,
      level: 1,
    });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
  }
  await page.goto("/department/students");
  await page.getByLabel("بحث بالاسم أو الرقم الجامعي").fill(`طلب حذف ${tag}`);
  for (const n of [1, 2]) await page.getByLabel(`تحديد طلب حذف ${tag} ${n}`).check();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({ path: info.outputPath(`request-students-${info.project.name}.png`) });
  await page.getByRole("button", { name: /طلب حذف المحدَّدين \(2\)/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("سبب الحذف").fill("أُضيفا خطأً");
  await dialog.getByRole("button", { name: "أرسل الطلب" }).click();
  await expect(dialog).toContainText("وصل طلبك إلى مدير النظام");
  await dialog.getByRole("button", { name: "إغلاق" }).click();
  // Nothing changed yet.
  await expect(page.getByText(`طلب حذف ${tag} 1`).first()).toBeVisible();

  const admin = await browser.newPage({ baseURL: info.project.use.baseURL });
  await signIn(admin, "admin@demo.ecst.test");
  await admin.goto("/system/deletions");
  const card = admin
    .locator("div", { has: admin.getByRole("heading", { name: new RegExp(`طلب حذف ${tag}`) }) })
    .last();
  await expect(card.locator("[data-request-preview]")).toContainText("طالب");
  await card.getByRole("button", { name: "موافقة وحذف" }).click();
  const confirm = admin.getByRole("dialog");
  await confirm.getByLabel(/^اكتب «2» للتأكيد/).fill("2");
  await confirm.getByLabel("كلمة مرورك في المنصة").fill(PASSWORD);
  await confirm.getByRole("button", { name: "احذف نهائيًا" }).click();
  await expect(confirm).toContainText("حُذف ما يلي");
  await admin.close();

  await page.goto("/deletion-requests");
  await expect(page.locator('[data-my-request="approved"]').first()).toContainText(
    `طلب حذف ${tag}`,
  );
  expect(
    (await call(page, "GET", `/api/v1/students?search=${encodeURIComponent(`طلب حذف ${tag}`)}`))
      .json.count,
  ).toBe(0);
});
