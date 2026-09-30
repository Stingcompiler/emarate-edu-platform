import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The public site (docs/02 §6): every page reachable from /ar/ and /en/ loads, links nowhere
// broken, fits the screen, is accessible (WCAG AA) and carries its SEO basics.
const SITE = "http://localhost:4322";

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
      links: [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")!),
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

test("the programme page keeps «apply to this programme» in reach on the phone", async ({
  page,
  isMobile,
}) => {
  await page.goto(`${SITE}/ar/programs/BIT/`);
  const sticky = page.getByRole("link", { name: "قدّم لهذا البرنامج" });
  if (!isMobile) {
    await expect(sticky).toBeHidden(); // desktop keeps the button in the page header
    return;
  }
  await page.mouse.wheel(0, 3000); // scrolled past the header's button
  await expect(sticky).toBeInViewport();
  await expect(sticky).toHaveAttribute("href", /\/apply\?program=BIT$/);
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
