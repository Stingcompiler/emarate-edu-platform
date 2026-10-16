import { expect, test } from "@playwright/test";

// Visitors must never see the demo's sample texts («(مثال)» / «(Example)»), however many of
// them the demo holds (design review U01). Runs only with E2E_HIDE_SAMPLE=1, which starts the
// site hiding them (apps/landing/src/lib/sample.mjs); the other tests need them shown, so CI
// runs this file in its own step.
test.skip(process.env.E2E_HIDE_SAMPLE !== "1", "set E2E_HIDE_SAMPLE=1");
const SITE = process.env.E2E_SITE_URL ?? "http://localhost:4322";
const SAMPLE = /\(\s*مثال\s*\)|\(\s*example\s*\)/i;

test("the site shows no sample text, and still shows the real content", async ({
  page,
  request,
}) => {
  test.setTimeout(600_000);
  const paths = [
    "/ar/",
    "/en/",
    "/ar/programs/",
    "/ar/programs/BIT/",
    "/en/programs/BIT/",
    "/ar/departments/",
    "/ar/news/",
    "/ar/events/",
    "/ar/about/",
    "/ar/admissions/",
    "/ar/contact/",
    "/ar/calendar/",
  ];
  for (const path of paths) {
    const response = await page.goto(SITE + path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), path).toBe(200);
    const html = await page.content();
    expect(html.match(SAMPLE)?.[0], `sample text on ${path}`).toBeUndefined();
  }
  // The real content stays: the invitation to apply and the programme's facts.
  await page.goto(`${SITE}/ar/programs/BIT/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("تقنية المعلومات");
  await expect(page.getByRole("link", { name: "قدّم لهذا البرنامج" }).first()).toBeVisible();
  // A page that held only sample content is gone, and so is its menu link.
  expect((await request.get(`${SITE}/ar/about/dean/`)).status()).toBe(404);
  await page.goto(`${SITE}/ar/`);
  await expect(page.locator('header a[href="/ar/about/dean/"]')).toHaveCount(0);
  // The sitemap does not list it either.
  const sitemap = await (await request.get(`${SITE}/sitemap.xml`)).text();
  expect(sitemap).not.toContain("/about/dean/");
});
