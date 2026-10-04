/* Targeted local UX probes: keyboard focus, failed/loading reads, text enlargement,
 * public light/dark contrast. Synthetic demo account only; no business writes. */
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const { chromium } = require(path.join(root, "node_modules/@playwright/test"));
const { default: AxeBuilder } = require(path.join(root, "node_modules/@axe-core/playwright"));
const output = path.join(root, "docs/qa/evidence/design-review-2026-10/states.json");
const pictures = "/tmp/ecst-design-review";
const data = { focus: [], publicAxe: [], type: [], readStates: [], enlargement: [], bottom: [] };
function save() {
  fs.writeFileSync(output, JSON.stringify(data, null, 2));
}
async function shot(p, n) {
  await p.screenshot({ path: path.join(pictures, n) });
}
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const c = await browser.newContext({
    locale: "ar",
    colorScheme: "light",
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const p = await c.newPage();
  await p.goto("http://localhost:5184/login", { waitUntil: "networkidle" });
  await p.getByLabel("الرقم الجامعي أو البريد").fill("26-IT-0001");
  for (const key of ["initial", "Tab"]) {
    if (key === "Tab") await p.keyboard.press("Tab");
    data.focus.push(
      await p.evaluate(() => {
        let e = document.activeElement,
          s = getComputedStyle(e),
          l = e.closest("label");
        return {
          name: e.getAttribute("name"),
          label: l?.innerText,
          focusVisible: e.matches(":focus-visible"),
          outlineStyle: s.outlineStyle,
          outlineWidth: s.outlineWidth,
          boxShadow: s.boxShadow,
          border: s.border,
          background: s.backgroundColor,
          labelOutline: l ? getComputedStyle(l).outline : "",
          describedBy: e.getAttribute("aria-describedby"),
        };
      }),
    );
  }
  await shot(p, "login-keyboard-focus-390.png");
  save();
  for (const route of ["/ar/", "/ar/programs/BIT/", "/ar/contact/", "/en/"]) {
    for (const width of [390, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.goto("http://localhost:4332" + route, { waitUntil: "networkidle" });
      await p.evaluate(() => document.fonts.ready);
      data.type.push({
        route,
        width,
        headings: await p.locator("h1,h2,h3,dd").evaluateAll((es) =>
          es
            .map((e) => {
              const s = getComputedStyle(e);
              return {
                text: e.textContent.trim().slice(0, 70),
                font: s.fontFamily,
                size: s.fontSize,
                line: s.lineHeight,
                weight: s.fontWeight,
              };
            })
            .filter((r) => r.font.includes("Noto")),
        ),
      });
      for (const dark of [false, true]) {
        await p.evaluate(
          (d) => (document.documentElement.dataset.theme = d ? "dark" : "light"),
          dark,
        );
        await p.waitForTimeout(400);
        const result = await new AxeBuilder({ page: p })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        data.publicAxe.push({
          route,
          width,
          dark,
          violations: result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        });
        save();
        if (dark && route === "/ar/") await shot(p, `public-home-${width}-dark.png`);
      }
      console.log(`Public states ${route} ${width}`);
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto("http://localhost:5184/login");
  await p.getByLabel("الرقم الجامعي أو البريد").fill("26-IT-0001");
  await p
    .getByLabel("كلمة المرور", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "e2e-pass-2026");
  await p.getByRole("button", { name: "تسجيل الدخول" }).click();
  await p.waitForURL((u) => u.pathname !== "/login");
  await p.route("**/api/v1/me/results", async (r) => {
    await new Promise((res) => setTimeout(res, 5000));
    await r.continue();
  });
  await p.goto("http://localhost:5184/results", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1000);
  data.readStates.push({
    kind: "loading",
    text: await p.locator("main").innerText(),
    busy: await p.locator("main [aria-busy='true']").count(),
  });
  await shot(p, "results-loading-390.png");
  await p.waitForLoadState("networkidle");
  await p.unroute("**/api/v1/me/results");
  await p.route("**/api/v1/me/results", (r) =>
    r.fulfill({ status: 503, json: { detail: "Local review unavailable" } }),
  );
  await p.reload();
  await p.getByRole("alert").first().waitFor({ timeout: 15000 });
  data.readStates.push({
    kind: "503",
    text: await p.locator("main").innerText(),
    alerts: await p.getByRole("alert").allTextContents(),
  });
  await shot(p, "results-error-390.png");
  await p.unroute("**/api/v1/me/results");
  save();
  for (const [base, route, group] of [
    ["http://localhost:5184", "/results", "student"],
    ["http://localhost:5184", "/courses", "student"],
    ["http://localhost:4332", "/ar/", "public"],
    ["http://localhost:5184", "/apply", "guest"],
  ]) {
    for (const [width, height] of [
      [320, 844],
      [375, 844],
      [844, 390],
    ]) {
      await p.setViewportSize({ width, height });
      await p.goto(base + route, { waitUntil: "networkidle" });
      const before = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        height: document.documentElement.scrollHeight,
      }));
      await p.evaluate(() => (document.documentElement.style.fontSize = "200%"));
      await p.waitForTimeout(300);
      const after = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        height: document.documentElement.scrollHeight,
        head: document.querySelector("h1")?.innerText,
      }));
      data.enlargement.push({
        group,
        route,
        width,
        height,
        kind: "root font-size 200%; not browser zoom",
        before,
        after,
      });
      if (width === 375) await shot(p, `${group}-${route.replace(/\W/g, "-")}-text200-375.png`);
      save();
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(base + route, { waitUntil: "networkidle" });
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(200);
    data.bottom.push({
      group,
      route,
      overflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    });
    await shot(p, `${group}-${route.replace(/\W/g, "-")}-bottom-390.png`);
  }
  await browser.close();
  save();
  console.log(JSON.stringify(data));
})().catch((e) => {
  console.error(e);
  save();
  process.exit(1);
});
