import { type Page, expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Review 2026-11-10 §3, «النظام»: an author who may not delete asks for it; the system
// supervisor approves (roles-matrix `deletions.approve`); the announcement leaves the author's
// list and the request shows who decided. Each side reloads before it checks.

/** JSON API call with the signed-in session (setup only, never the behaviour under test). */
async function call(page: Page, method: string, url: string, body?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const res = await page.request.fetch(url, {
    method,
    headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok(), `${method} ${url}: ${res.status()} ${await res.text()}`).toBe(true);
  return res.json();
}

test("an author asks to delete an announcement and the supervisor approves it", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const title = `تأجيل محاضرة ${info.project.name} ${Date.now()}`;

  await signIn(page, "academic@demo.ecst.test");
  await call(page, "POST", "/api/v1/announcements", {
    scope: "college",
    audience: "staff",
    title,
    body: "<p>تؤجل المحاضرة إلى الأسبوع القادم.</p>",
    status: "published",
  });
  await page.goto("/announcements");
  const card = page
    .locator("article, div")
    .filter({ has: page.getByRole("heading", { name: title }) });
  await card.getByRole("button", { name: "طلب حذف" }).last().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "إرسال الطلب" }).click();
  await page.reload();
  await expect(page.getByText("طلب الحذف بانتظار الموافقة").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toBeVisible(); // still there

  const staff = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: page.viewportSize(),
    locale: "ar",
  });
  const desk = await staff.newPage();
  await signIn(desk, "supervisor@demo.ecst.test");
  await desk.goto("/system/deletions");
  const request = desk.locator("li, article, div").filter({ hasText: title });
  await request.getByRole("button", { name: "موافقة وحذف" }).last().click();
  await desk.getByRole("alertdialog").getByRole("button", { name: "الموافقة والحذف" }).click();
  await desk.reload();
  await expect(desk.getByText(title)).toHaveCount(0); // nothing left waiting
  await desk.getByRole("button", { name: "الكل", exact: true }).click();
  await expect(desk.getByText(title).first()).toBeVisible(); // the request keeps what it was
  await expect(desk.getByText(/وافق/).first()).toBeVisible();
  await staff.close();

  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
});
