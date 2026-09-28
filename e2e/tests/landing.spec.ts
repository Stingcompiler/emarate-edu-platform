import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The public site (docs/02 §6): every page reachable from /ar/ and /en/ loads, links nowhere
// broken, fits the screen, is accessible (WCAG AA) and carries its SEO basics.
const SITE = "http://localhost:4322";

test("every public page loads, fits, is accessible and has its SEO basics", async ({ page }) => {
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
    }));
    if (info.overflow > 0) problems.push(`${path}: overflows sideways by ${info.overflow}px`);
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
