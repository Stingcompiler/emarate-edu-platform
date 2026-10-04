/* Repeat the portal axe sample after colour transitions settle. Raw initial
 * measurements are retained: do not interpret intermediate animation colours
 * as persistent contrast failures. */
const fs = require("node:fs"),
  path = require("node:path"),
  root = process.cwd();
const { chromium } = require(path.join(root, "node_modules/@playwright/test"));
const { default: AxeBuilder } = require(path.join(root, "node_modules/@axe-core/playwright"));
const rows = [];
const out = path.join(root, "docs/qa/evidence/design-review-2026-10/theme-confirmation.json");
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  for (const [group, id, routes] of [
    ["student", "26-IT-0001", ["/"]],
    ["teacher", "teacher@demo.ecst.test", ["/"]],
    ["department", "dept.manager@demo.ecst.test", ["/department"]],
    ["head-registrar", "head.registrar@demo.ecst.test", ["/registrar"]],
    ["admin", "admin@demo.ecst.test", ["/system", "/system/users"]],
  ]) {
    const c = await b.newContext({ locale: "ar", colorScheme: "light", reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.goto("http://localhost:5184/login");
    await p.getByLabel("الرقم الجامعي أو البريد").fill(id);
    await p
      .getByLabel("كلمة المرور", { exact: true })
      .fill(process.env.DEMO_PASSWORD || "e2e-pass-2026");
    await p.getByRole("button", { name: "تسجيل الدخول" }).click();
    await p.waitForURL((u) => u.pathname !== "/login");
    for (const route of routes)
      for (const width of [390, 1440])
        for (const dark of [false, true]) {
          await p.setViewportSize({ width, height: 900 });
          await p.goto("http://localhost:5184" + route, { waitUntil: "networkidle" });
          await p.evaluate(
            (d) => (document.documentElement.dataset.theme = d ? "dark" : "light"),
            dark,
          );
          await p.waitForTimeout(400);
          const a = await new AxeBuilder({ page: p })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          rows.push({
            group,
            route,
            width,
            dark,
            settleMs: 400,
            violations: a.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
            })),
          });
          fs.writeFileSync(out, JSON.stringify(rows, null, 2));
        }
    await c.close();
    console.log(`Stable theme ${group}`);
  }
  await b.close();
  console.log(
    JSON.stringify({ checks: rows.length, failing: rows.filter((r) => r.violations.length) }),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
