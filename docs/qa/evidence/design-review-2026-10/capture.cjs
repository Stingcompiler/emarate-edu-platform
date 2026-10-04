/* Local read-only design review. Run from the repository root with the E2E API,
 * portal and landing servers already running. Uses synthetic demo accounts only.
 * Sign-in creates sessions; page review does not submit business forms.
 * Screenshots go to /tmp, never export storageState, cookies or tokens. */
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const { chromium } = require(path.join(root, "node_modules/@playwright/test"));
const { default: AxeBuilder } = require(path.join(root, "node_modules/@axe-core/playwright"));
const portal = "http://localhost:5184";
const site = "http://localhost:4332";
const out = path.join(root, "docs/qa/evidence/design-review-2026-10");
const pictures = "/tmp/ecst-design-review";
fs.mkdirSync(pictures, { recursive: true });
const sizes = [
  [390, 844],
  [768, 1024],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];
const accounts = [
  ["student", "26-IT-0001"],
  ["teacher", "teacher@demo.ecst.test"],
  ["ta", "ta@demo.ecst.test"],
  ["department", "dept.manager@demo.ecst.test"],
  ["supervisor", "dept.supervisor@demo.ecst.test"],
  ["head-registrar", "head.registrar@demo.ecst.test"],
  ["registrar", "registrar@demo.ecst.test"],
  ["results", "results@demo.ecst.test"],
  ["academic", "academic@demo.ecst.test"],
  ["affairs", "student.affairs@demo.ecst.test"],
  ["hr", "hr@demo.ecst.test"],
  ["site-manager", "site@demo.ecst.test"],
  ["events", "events@demo.ecst.test"],
  ["admin", "admin@demo.ecst.test"],
];
const selected = new Set([
  "public:/ar/",
  "public:/ar/about/",
  "public:/ar/programs/",
  "public:/ar/admissions/",
  "public:/ar/contact/",
  "public:/ar/parents/",
  "public:/en/",
  "student:/",
  "student:/courses",
  "student:/results",
  "student:/me",
  "teacher:/",
  "teacher:/grading",
  "department:/department",
  "department:/department/courses",
  "head-registrar:/applications",
  "results:/results-office",
  "affairs:/affairs/cases",
  "admin:/system/users",
  "admin:/system/structure",
  "admin:/system/roles",
  "guest:/login",
  "guest:/apply",
  "guest:/track",
]);
const rows = [],
  inventories = [],
  axe = [],
  exceptions = [];
function key(group, route) {
  return `${group}:${route}`;
}
function name(group, route) {
  return `${group}-${route.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "home"}`;
}
function save() {
  fs.writeFileSync(
    path.join(out, "measurements.json"),
    JSON.stringify(
      {
        reviewedCommit: "255ca23",
        capturedAt: new Date().toISOString(),
        sizes,
        browser: "installed Google Chrome / Playwright Chromium, synthetic E2E SQLite data",
        inventories,
        rows,
        axe,
        exceptions,
      },
      null,
      2,
    ),
  );
}
async function signIn(page, identifier) {
  await page.goto(`${portal}/login`);
  await page.getByLabel("الرقم الجامعي أو البريد").fill(identifier);
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "e2e-pass-2026");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
  await page.locator("nav a").first().waitFor();
}
async function measure(page) {
  return page.evaluate(() => {
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        !el.closest("[inert],[aria-hidden='true']")
      );
    };
    const info = (el) => {
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el);
      return {
        text: (el.innerText || el.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .slice(0, 90),
        tag: el.tagName,
        class: el.className,
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
        font: s.fontFamily,
        size: parseFloat(s.fontSize),
        line: s.lineHeight,
        color: s.color,
        background: s.backgroundColor,
      };
    };
    const main = document.querySelector("main"),
      mr = main?.getBoundingClientRect();
    const small = Array.from(
      document.querySelectorAll("main p, main label, main span, main a, aside p"),
    )
      .filter(
        (el) =>
          shown(el) && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 12,
      )
      .map(info);
    const outside = Array.from(document.querySelectorAll("main *, header *, nav *"))
      .filter((el) => {
        if (!shown(el)) return false;
        const r = el.getBoundingClientRect();
        return r.left < -1 || r.right > innerWidth + 1;
      })
      .slice(0, 10)
      .map(info);
    const targets = Array.from(
      document.querySelectorAll("a,button,input,select,summary,[role='button']"),
    )
      .filter(shown)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      })
      .slice(0, 15)
      .map(info);
    return {
      title: document.title,
      h1: Array.from(document.querySelectorAll("h1")).filter(shown).map(info),
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      main: mr ? { x: mr.x, width: mr.width, height: mr.height } : null,
      fontFaces: Array.from(document.fonts)
        .filter((f) => f.status === "loaded")
        .map((f) => ({ family: f.family, weight: f.weight })),
      smallText: small.slice(0, 15),
      outside,
      smallTargetCandidates: targets,
      tables: Array.from(document.querySelectorAll("table")).filter(shown).length,
      bodyHeight: document.documentElement.scrollHeight,
      denied: document.body.innerText.includes("هذه الصفحة ليست ضمن صلاحياتك"),
    };
  });
}
async function inspect(page, base, group, route, extraSizes = []) {
  for (const [width, height] of [...sizes, ...extraSizes]) {
    try {
      await page.setViewportSize({ width, height });
      await page.goto(base + route, { waitUntil: "networkidle", timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const row = {
        group,
        route,
        width,
        height,
        finalPath: new URL(page.url()).pathname,
        ...(await measure(page)),
      };
      if (selected.has(key(group, route))) {
        const screenshot = `${name(group, route)}-${width}.png`;
        await page.screenshot({ path: path.join(pictures, screenshot), fullPage: false });
        row.screenshot = screenshot;
      }
      rows.push(row);
      save();
    } catch (error) {
      exceptions.push({ group, route, width, error: String(error).slice(0, 300) });
      save();
    }
  }
  console.log(`Reviewed ${group} ${route}; ${rows.length} viewport checks`);
}
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const guest = await browser.newContext({
    locale: "ar",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await guest.newPage();
  for (const route of [
    "/ar/",
    "/ar/about/",
    "/ar/programs/",
    "/ar/departments/",
    "/ar/admissions/",
    "/ar/news/",
    "/ar/events/",
    "/ar/calendar/",
    "/ar/contact/",
    "/ar/parents/",
    "/ar/regulations/",
    "/en/",
    "/en/programs/",
  ])
    await inspect(
      page,
      site,
      "public",
      route,
      ["/ar/", "/ar/admissions/"].includes(route)
        ? [
            [320, 844],
            [375, 844],
            [1024, 768],
          ]
        : [],
    );
  for (const listing of ["programs", "departments", "news", "events", "announcements"]) {
    await page.goto(`${site}/ar/${listing}/`);
    const links = await page
      .locator(`main a[href^='/ar/${listing}/']`)
      .evaluateAll((es) => es.map((e) => e.getAttribute("href")));
    const route = links.find((h) => h !== `/ar/${listing}/`);
    if (route) {
      selected.add(key("public", route));
      await inspect(page, site, "public", route);
    }
  }
  for (const route of ["/login", "/register", "/forgot-password", "/apply", "/track"])
    await inspect(
      page,
      portal,
      "guest",
      route,
      route === "/apply"
        ? [
            [320, 844],
            [375, 844],
          ]
        : [],
    );
  await guest.close();
  const seen = new Set();
  for (const [group, identifier] of accounts) {
    const context = await browser.newContext({
      locale: "ar",
      colorScheme: "light",
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 900 },
    });
    const p = await context.newPage();
    await signIn(p, identifier);
    const routes = await p
      .locator("aside nav a[href^='/']")
      .evaluateAll((es) => [...new Set(es.map((e) => e.getAttribute("href")))]);
    inventories.push({ group, routes });
    save();
    const home = new URL(p.url()).pathname;
    const review = routes.filter((r) => !seen.has(r));
    if (!review.includes(home)) review.unshift(home);
    for (const route of review) {
      seen.add(route);
      await inspect(
        p,
        portal,
        group,
        route,
        ["/system/users", "/department", "/results-office"].includes(route)
          ? [
              [320, 844],
              [375, 844],
              [1024, 768],
            ]
          : [],
      );
    }
    if (["student", "teacher"].includes(group)) {
      for (const list of ["/courses", "/exams", ...(group === "student" ? ["/tasks"] : [])]) {
        await p.goto(portal + list, { waitUntil: "networkidle" });
        const links = await p
          .locator("main a[href^='/']")
          .evaluateAll((es) => es.map((e) => e.getAttribute("href")));
        const detail =
          links.find((r) => r.startsWith(list + "/") && !r.endsWith("/new")) ||
          (list === "/tasks" ? links.find((r) => r.startsWith("/assignments/")) : null);
        if (detail) {
          selected.add(key(group, detail));
          await inspect(p, portal, group, detail);
        }
      }
    }
    if (["student", "teacher", "admin", "department", "head-registrar"].includes(group)) {
      for (const route of [home, ...(group === "admin" ? ["/system/users"] : [])]) {
        for (const width of [390, 1440])
          for (const dark of [false, true]) {
            await p.setViewportSize({ width, height: 900 });
            await p.goto(portal + route, { waitUntil: "networkidle" });
            await p.evaluate(
              (d) => (document.documentElement.dataset.theme = d ? "dark" : "light"),
              dark,
            );
            await p.waitForTimeout(400);
            const a = await new AxeBuilder({ page: p })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze();
            axe.push({
              group,
              route,
              width,
              dark,
              violations: a.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
              })),
            });
            save();
            if (dark)
              await p.screenshot({
                path: path.join(pictures, `${name(group, route)}-${width}-dark.png`),
              });
          }
      }
    }
    await context.close();
  }
  await browser.close();
  save();
  console.log(
    JSON.stringify({
      checks: rows.length,
      exceptions: exceptions.length,
      overflows: rows
        .filter((r) => r.overflow > 0)
        .map((r) => ({ group: r.group, route: r.route, width: r.width, overflow: r.overflow })),
      axeFindings: axe.filter((a) => a.violations.length),
    }),
  );
})().catch((e) => {
  console.error(e);
  save();
  process.exit(1);
});
