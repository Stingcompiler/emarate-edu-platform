import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Review 2026-11-10 §3, «مدير الموقع والفعاليات»: an event published in the portal appears on
// the public site's lists in both languages; taken back to a draft, it leaves them.
const SITE = process.env.E2E_SITE_URL ?? "http://localhost:4322";

const local = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

test("an event published in the portal reaches the site, and leaves it as a draft", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const title = `ندوة الأمن السيبراني ${stamp}`;
  const slug = `cyber-${stamp}`;
  const starts = new Date(Date.now() + 10 * 86_400_000);

  await signIn(page, "events@demo.ecst.test");
  await page.goto("/events/new");
  await page.getByLabel("العنوان", { exact: true }).fill(title);
  await page.getByRole("textbox", { name: /^الرابط/ }).fill(slug);
  await page.getByLabel("يبدأ", { exact: true }).fill(local(starts));
  await page
    .getByLabel("ينتهي", { exact: true })
    .fill(local(new Date(starts.getTime() + 2 * 3_600_000)));
  await page.getByLabel("المكان", { exact: true }).fill("قاعة المؤتمرات");
  await page
    .getByLabel("الوصف", { exact: true })
    .fill("ندوة مفتوحة للطلاب عن أساسيات الأمن السيبراني.");
  const saved = page.waitForResponse(
    (r) =>
      /\/api\/v1\/content\/events/.test(r.url()) &&
      ["POST", "PATCH"].includes(r.request().method()),
  );
  await page.getByRole("button", { name: "نشر الفعالية" }).click();
  expect((await saved).ok()).toBe(true);

  // A visitor of the site (no session) finds it in both languages' lists. (Its own page is made
  // by the build: `astro dev` keeps the event pages it listed on its first request, so a page
  // added or removed since is checked by the production rebuild, not here.)
  const visitor = await browser.newContext({ viewport: page.viewportSize(), locale: "ar" });
  const site = await visitor.newPage();
  for (const lang of ["ar", "en"]) {
    await site.goto(`${SITE}/${lang}/events`);
    await expect(site.getByText(title).first(), lang).toBeVisible();
  }

  // Back to a draft in the portal: gone from the lists.
  await page.reload();
  const draft = page.waitForResponse(
    (r) => /\/api\/v1\/content\/events/.test(r.url()) && r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "حفظ مسودة" }).click();
  expect((await draft).ok()).toBe(true);
  for (const lang of ["ar", "en"]) {
    await site.goto(`${SITE}/${lang}/events`);
    await expect(site.getByText(title), lang).toHaveCount(0);
  }
  await visitor.close();
});
