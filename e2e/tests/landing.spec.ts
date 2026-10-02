import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The public site (docs/02 §6): every page reachable from /ar/ and /en/ loads, links nowhere
// broken, fits the screen, is accessible (WCAG AA) and carries its SEO basics.
const SITE = process.env.E2E_SITE_URL ?? "http://localhost:4322";

test("every public page loads, fits, is accessible and has its SEO basics", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(600_000);
  const problems: string[] = [];
  let current = "";
  page.on("pageerror", (e) => problems.push(`${current}: script error ${e.message}`));

  const queue = ["/ar/", "/en/"];
  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    current = path;
    const response = await page.goto(SITE + path, { waitUntil: "networkidle" });
    if (!response || response.status() >= 400) {
      problems.push(`${path}: HTTP ${response?.status()}`);
      continue;
    }
    const info = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
      h1: document.querySelectorAll("h1").length,
      lang: document.documentElement.lang,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      imagesWithoutAlt: document.querySelectorAll("img:not([alt])").length,
      // Pages only: files such as an event's .ics are downloads, checked on their own.
      links: [...document.querySelectorAll("a[href^='/']:not([download])")].map((a) =>
        a.getAttribute("href")!,
      ),
      // Large screens: every block of <main> spans the header's container (no phone-width
      // column floating in the middle of a wide screen — owner rule, skill responsive-page).
      narrow: (() => {
        const header = document.querySelector("header > div")!.getBoundingClientRect().width;
        return [...document.querySelectorAll("main > *")]
          .map((el) => el.getBoundingClientRect().width)
          .filter((w) => w > 0 && w < header * 0.9)
          .map(Math.round);
      })(),
    }));
    if (info.overflow > 0) problems.push(`${path}: overflows sideways by ${info.overflow}px`);
    if (!isMobile && info.narrow.length)
      problems.push(
        `${path}: content narrower than the header on a wide screen (${info.narrow}px)`,
      );
    if (!info.title) problems.push(`${path}: no <title>`);
    if (!info.description) problems.push(`${path}: no meta description`);
    if (info.h1 !== 1) problems.push(`${path}: ${info.h1} h1 elements`);
    if (!info.lang) problems.push(`${path}: no lang`);
    if (!info.canonical) problems.push(`${path}: no canonical link`);
    if (info.imagesWithoutAlt)
      problems.push(`${path}: ${info.imagesWithoutAlt} images without alt`);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .exclude("astro-dev-toolbar")
      .analyze();
    for (const v of violations)
      if (v.impact === "serious" || v.impact === "critical")
        problems.push(`${path}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    for (const href of info.links) {
      const clean = href.split("#")[0];
      if (clean && !clean.startsWith("//") && !seen.has(clean)) queue.push(clean);
    }
  }
  expect(seen.size).toBeGreaterThan(20);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("the programme page keeps «apply to this programme» in reach", async ({ page, isMobile }) => {
  await page.goto(`${SITE}/ar/programs/BIT/`);
  const bar = page.locator("[data-apply-bar]").getByRole("link", { name: "قدّم لهذا البرنامج" });
  const card = page
    .getByRole("region", { name: "أساسيات المتقدم" })
    .getByRole("link", { name: "قدّم لهذا البرنامج" });
  await expect(card).toHaveAttribute("href", /\/apply\?program=BIT$/);
  await page.mouse.wheel(0, 3000); // scrolled past the page header's button
  if (isMobile) {
    await expect(bar).toBeInViewport();
    await expect(bar).toHaveAttribute("href", /\/apply\?program=BIT$/);
  } else {
    await expect(bar).toBeHidden();
    await expect(card).toBeInViewport(); // the side card is sticky on large screens
  }
});

test("the programme page states its fees, and the fees page lists every programme", async ({
  page,
}) => {
  // The demo data sets yearly fees (seed_demo); the college enters its own.
  await page.goto(`${SITE}/ar/programs/BIT/`);
  const facts = page.getByRole("region", { name: "أساسيات المتقدم" });
  await expect(facts).toContainText("الرسوم السنوية");
  await expect(facts).toContainText("جنيه");
  await expect(page.getByRole("heading", { name: "ماذا ستتعلم" })).toBeVisible();
  await page.goto(`${SITE}/ar/admissions/fees/`);
  const table = page.getByRole("region", { name: "الرسوم السنوية لكل برنامج" });
  await expect(table.getByRole("link", { name: "بكالوريوس تقنية المعلومات" })).toBeVisible();
});

test("the programme finder narrows by name, spelling-tolerant, and by department", async ({
  page,
}) => {
  await page.goto(`${SITE}/ar/programs/`);
  const rows = page.locator("[data-degree]:visible");
  const total = await rows.count();
  // «ادارة» without the hamza still finds «إدارة الأعمال».
  await page.getByRole("searchbox").fill("ادارة الاعمال");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThan(total);
  for (const text of await rows.allTextContents()) expect(text).toContain("الأعمال");
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "الهندسة", exact: true }).click();
  await expect(rows.first()).toBeVisible();
  for (const text of await page.locator("[data-group]:visible h2").allTextContents())
    expect(text).toContain("الهندسة");
  await page.getByRole("searchbox").fill("لا يوجد برنامج بهذا الاسم");
  await expect(page.getByText("لا برامج تطابق البحث.")).toBeVisible();
});

test("WhatsApp is one tap away, and parents have their own page", async ({ page }) => {
  // The demo sets a (fake) WhatsApp number and office hours (seed_demo).
  await page.goto(`${SITE}/ar/`);
  await expect(page.getByRole("link", { name: "تواصل عبر واتساب" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\d+$/,
  );
  await page.getByRole("link", { name: "دليل وليّ الأمر" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("لأولياء الأمور");
  await expect(page.getByRole("heading", { name: "كم تكلف الدراسة؟" })).toBeVisible();
  await page.goto(`${SITE}/ar/contact/`);
  await expect(page.getByText("ساعات العمل:")).toBeVisible();
  // The contact page shows WhatsApp in its quick row, so no floating button there.
  await expect(page.getByRole("link", { name: "تواصل عبر واتساب" })).toHaveCount(0);
});

test("an event can be added to a calendar, with directions to the college", async ({
  page,
  request,
}) => {
  await page.goto(`${SITE}/ar/events/open-day/`);
  const add = page.getByRole("link", { name: "أضف إلى التقويم" });
  await expect(add).toHaveAttribute("href", "/events/open-day.ics");
  const ics = await request.get(`${SITE}/events/open-day.ics`);
  expect(ics.ok()).toBe(true);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  expect(body).toContain("SUMMARY:يوم التعريف بالكلية");
  await expect(page.getByRole("link", { name: "الاتجاهات إلى الكلية" })).toBeVisible();
});

test("English pages mark Arabic-only content, and every trail is structured data", async ({
  page,
}) => {
  // The demo's official pages are written in Arabic only.
  await page.goto(`${SITE}/en/about/dean/`);
  await expect(page.getByText("Available in Arabic for now.")).toBeVisible();
  await expect(
    page.locator('main [lang="ar"][dir="rtl"], [lang="ar"][dir="rtl"]').first(),
  ).toBeAttached();
  await page.goto(`${SITE}/ar/programs/BIT/`);
  const trail = page.getByRole("navigation", { name: "مسار الصفحة" });
  await expect(trail.locator('[aria-current="page"]')).toHaveText("بكالوريوس تقنية المعلومات");
  const lds = await page.locator('script[type="application/ld+json"]').allTextContents();
  const crumbs = lds.map((t) => JSON.parse(t)).find((d) => d["@type"] === "BreadcrumbList");
  expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual([
    "الرئيسية",
    "البرامج",
    "تقنية المعلومات",
    "بكالوريوس تقنية المعلومات",
  ]);
});

test("a department page shows the members who chose to appear, and its own news", async ({
  page,
}) => {
  // The demo's IT head and a teacher turned their public profile on; the head posted news.
  await page.goto(`${SITE}/ar/departments/IT/`);
  const faculty = page.getByRole("region", { name: "هيئة التدريس" });
  await expect(faculty.getByText("د. مصطفى الأمين")).toBeVisible();
  await expect(faculty.getByText("رئيس القسم")).toBeVisible();
  const news = page.getByRole("region", { name: "أخبار القسم" });
  await expect(news.getByRole("heading", { name: "(مثال) افتتاح معمل الشبكات" })).toBeVisible();
  // Another department has neither yet, so neither section shows.
  await page.goto(`${SITE}/ar/departments/BA/`);
  await expect(page.getByRole("region", { name: "هيئة التدريس" })).toHaveCount(0);
});

test("the site menus come from the CMS and behave like menus", async ({ page, isMobile }) => {
  await page.goto(`${SITE}/ar/`);
  const header = page.locator("header");
  // Default menus (content migration 0002) link the official pages once published (the demo
  // publishes them; the crawl above proves no menu link is a 404).
  await expect(header.locator('a[href="/ar/about/dean/"]').first()).toBeAttached();
  const toggle = isMobile
    ? header.getByLabel("القائمة")
    : header.locator("nav summary", { hasText: "الأكاديمية" });
  await toggle.click();
  const calendar = header.getByRole("link", { name: "التقويم الأكاديمي" });
  await expect(calendar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
  await toggle.click();
  // A tap outside closes it (on the phone the panel fills the screen: tap the empty top bar).
  if (isMobile) await page.mouse.click(200, 32);
  else await page.mouse.click(8, page.viewportSize()!.height - 8);
  await expect(calendar).toBeHidden();
  if (isMobile) {
    await toggle.click();
    // The open menu carries «apply» too (the top bar has its own button while an intake is open).
    await expect(header.getByRole("group").getByRole("link", { name: "قدّم الآن" })).toBeVisible();
  }
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "اللوائح" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "سياسة الخصوصية" })).toHaveAttribute(
    "href",
    "/ar/privacy/",
  );
});

test("motion never leaves content hidden, and «reduce motion» turns it off", async ({ page }) => {
  for (const path of ["/ar/", "/ar/admissions/", "/ar/news/", "/en/"]) {
    await page.goto(SITE + path);
    // Scroll through the page so every scroll-triggered element makes its entrance.
    for (let y = 0; y < 6000; y += 500) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(1200);
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-reveal], [data-count], .motion-lines span")]
        .filter(
          (el) => el.classList.contains("is-pending") || Number(getComputedStyle(el).opacity) < 1,
        )
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(hidden, `${path}: ${hidden.join("\n")}`).toEqual([]);
    // Counted figures end on their real value.
    const counts = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-count]")].map((el) => [
        el.dataset.count,
        el.textContent!.trim(),
      ]),
    );
    for (const [target, text] of counts)
      expect(text, path).toBe(Number(target).toLocaleString(path.startsWith("/ar") ? "ar" : "en"));
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${SITE}/ar/admissions/`);
  expect(await page.locator(".is-pending").count()).toBe(0);
  const anim = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".motion-lines span, [data-reveal]")].some(
      (el) => parseFloat(getComputedStyle(el).animationDuration) > 0.01,
    ),
  );
  expect(anim).toBe(false);
});
