/* Read-only review of representative editors and detail pages on local demo data. */
const fs = require("node:fs"),
  path = require("node:path");
const root = process.cwd();
const { chromium } = require(path.join(root, "node_modules/@playwright/test"));
const rows = [];
const sizes = [
  [390, 844],
  [768, 1024],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];
const out = path.join(root, "docs/qa/evidence/design-review-2026-10/details.json");
async function visit(p, group, route) {
  for (const [width, height] of sizes) {
    await p.setViewportSize({ width, height });
    await p.goto("http://localhost:5184" + route, { waitUntil: "networkidle" });
    await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      title: document.title,
      h1: document.querySelector("h1")?.innerText,
      denied: document.body.innerText.includes("هذه الصفحة ليست ضمن صلاحياتك"),
    }));
    rows.push({ group, route, width, height, ...r });
    if ([390, 1440, 1920].includes(width))
      await p.screenshot({
        path: `/tmp/ecst-design-review/detail-${group}-${route.replace(/\W/g, "-")}-${width}.png`,
      });
  }
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`Detail ${group} ${route}`);
}
async function login(p, id) {
  await p.goto("http://localhost:5184/login");
  await p.getByLabel("الرقم الجامعي أو البريد").fill(id);
  await p
    .getByLabel("كلمة المرور", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "e2e-pass-2026");
  await p.getByRole("button", { name: "تسجيل الدخول" }).click();
  await p.waitForURL((u) => u.pathname !== "/login");
}
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  for (const [group, id, base, discovery] of [
    [
      "teacher",
      "teacher@demo.ecst.test",
      ["/exams", "/exams/new", "/lectures/new", "/assignments/new"],
      [
        ["/grading", "/submissions/"],
        ["/courses/3", "/lectures/"],
      ],
    ],
    [
      "registrar",
      "head.registrar@demo.ecst.test",
      [],
      [
        ["/applications", "/applications/"],
        ["/students", "/students/"],
      ],
    ],
    ["affairs", "student.affairs@demo.ecst.test", ["/cases/new"], [["/cases", "/cases/"]]],
    [
      "admin",
      "admin@demo.ecst.test",
      ["/site/media", "/site/redirects"],
      [
        ["/system/users", "/system/users/"],
        ["/site", "/site/pages/"],
      ],
    ],
  ]) {
    const c = await b.newContext({ locale: "ar", reducedMotion: "reduce" });
    const p = await c.newPage();
    await login(p, id);
    for (const route of base) await visit(p, group, route);
    for (const [list, prefix] of discovery) {
      await p.goto("http://localhost:5184" + list, { waitUntil: "networkidle" });
      const links = await p
        .locator("main a[href]")
        .evaluateAll((es) => es.map((e) => e.getAttribute("href")));
      const route = links.find(
        (r) =>
          r.startsWith(prefix) && !new URL(r, "http://localhost:5184").pathname.endsWith("/new"),
      );
      if (route) await visit(p, group, route);
    }
    await c.close();
  }
  await b.close();
  console.log(`${rows.length} detail checks`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
