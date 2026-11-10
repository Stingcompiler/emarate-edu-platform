// Fills fit.csv (review 2026-11-10, inventory): every page × role × width the inventory lists,
// opened on the e2e servers. Not a permanent test. Run it from the repo root:
//   cp docs/qa/evidence/review-2026-11-10/inventory/fit_run.spec.ts e2e/tests/qa-fit-run.spec.ts
//   CI=1 pnpm e2e qa-fit-run.spec.ts ; rm e2e/tests/qa-fit-run.spec.ts
//   python3 docs/qa/evidence/review-2026-11-10/inventory/fit_fill.py
// The phone project gives the 390 rows, the desktop project the 1280 rows. Each result is one
// JSON line in fit-run-<project>.jsonl beside this file.
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Page, test } from "@playwright/test";

import { offscreen, signIn } from "./helpers";

const DIR = resolve(__dirname, "../../docs/qa/evidence/review-2026-11-10/inventory");
const SITE = process.env.E2E_SITE_URL ?? "http://localhost:4322";
const ACCOUNT: Record<string, string> = {
  student: "26-IT-0001",
  teacher: "teacher@demo.ecst.test",
  system_admin: "admin@demo.ecst.test",
};

type Row = { surface: string; page: string; who: string; width: number };
const rows: Row[] = readFileSync(`${DIR}/fit.csv`, "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [surface, page, who, width] = line.split(",");
    return { surface: surface!, page: page!, who: who!, width: Number(width) };
  });

/** A concrete address for a pattern: `/x/:id/y` from a link on `/x`; the catch-alls get an
 * address that matches nothing. Null when the demo data has nothing to open. */
async function concrete(page: Page, base: string, pattern: string): Promise<string | null> {
  if (pattern === "*") return "/no-such-page";
  if (pattern === "/ar/[...path]") return "/ar/no-such-page";
  if (pattern === "/en/[...path]") return "/en/no-such-page";
  const param = /:[a-z_]+|\[[a-z_.]+\]/i;
  if (!param.test(pattern)) return pattern;
  const [head] = pattern.split(param);
  const tail = pattern.slice(pattern.search(param)).replace(/^(:[a-z_]+|\[[a-z_.]+\])/i, "");
  const full = new RegExp(
    `^${pattern.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/:[a-z_]+|\\\[[a-z_\\.]+\\\]/gi, "[^/?#]+")}$`,
  );
  const prefix = new RegExp(`^${head!.replace(/[.*+?^${}()|\\[\]]/g, "\\$&")}[^/?#]+/?$`);
  const hubs = [head!.replace(/\/$/, "") || "/", head!.split("/").slice(0, 2).join("/") || "/"];
  if (head!.startsWith("/print/") || head === "/exam-attempts/" || head === "/submissions/")
    hubs.push("/", "/grading", "/results", "/exams", "/students", "/transcripts", "/reports");
  for (const hub of [...new Set(hubs)]) {
    await page.goto(`${base}${hub}`).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => null);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((all) => all.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
    const exact = hrefs.find((h) => full.test(h.replace(/(.)\/$/, "$1")));
    if (exact) return exact;
    const near = hrefs.find((h) => prefix.test(h));
    if (near) return `${near.replace(/\/$/, "")}${tail}`;
  }
  return null;
}

for (const who of ["-", "ar", "en", "(بلا دخول)", "student", "teacher", "system_admin"]) {
  test(`fit — ${who}`, async ({ page }, info) => {
    test.setTimeout(900_000);
    const width = info.project.name === "phone" ? 390 : 1280;
    const mine = rows.filter((r) => r.who === who && r.width === width);
    if (!mine.length) return;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    if (ACCOUNT[who]) await signIn(page, ACCOUNT[who]!);
    for (const row of mine) await check(page, row, info.project.name);
  });
}

/** The demo data a role lacks (the admin teaches no course): the rows the inventory gave the
 * admin that found nothing to open, tried again as the teacher and then as the student. */
for (const [as, account] of [
  ["teacher", "teacher@demo.ecst.test"],
  ["student", "26-IT-0001"],
] as const) {
  test(`fit — again as ${as}`, async ({ page }, info) => {
    test.setTimeout(900_000);
    const width = info.project.name === "phone" ? 390 : 1280;
    const log = `${DIR}/fit-run-${info.project.name}.jsonl`;
    const last = new Map<string, string>();
    for (const line of readFileSync(log, "utf8").trim().split("\n")) {
      const r = JSON.parse(line);
      last.set(`${r.surface},${r.page},${r.who}`, r.result);
    }
    const again = rows.filter(
      (r) =>
        r.width === width &&
        r.surface === "portal" &&
        last.get(`${r.surface},${r.page},${r.who}`)?.startsWith("n/a"),
    );
    if (!again.length) return;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await signIn(page, account);
    for (const row of again) await check(page, row, info.project.name, as);
  });
}

async function check(page: Page, row: Row, project: string, as?: string) {
  {
    {
      const base = row.surface === "site" ? SITE : "";
      let result: string;
      const address = await concrete(page, base, row.page).catch(() => null);
      if (address === null) {
        result = "n/a: nothing to open in the demo data";
      } else {
        const response = await page.goto(`${base}${address}`).catch((e) => String(e));
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => null);
        const landed = new URL(page.url()).pathname;
        const scroll = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        const out = await offscreen(page).catch(() => [] as string[]);
        const problems = [
          typeof response === "string" ? `load: ${response.slice(0, 80)}` : "",
          scroll > 1 ? `scrolls ${scroll}px sideways` : "",
          out.length ? `off: ${out.slice(0, 2).join(" | ")}` : "",
        ].filter(Boolean);
        const moved = landed !== address.split("?")[0] ? ` (opened ${landed})` : "";
        result = problems.length ? `fail: ${problems.join("; ")}${moved}` : `ok${moved}`;
      }
      if (as && !result.startsWith("n/a")) result += ` [as ${as}]`;
      if (as && result.startsWith("n/a")) result += ` (nor as ${as})`;
      appendFileSync(
        `${DIR}/fit-run-${project}.jsonl`,
        `${JSON.stringify({ ...row, address, result })}\n`,
      );
    }
  }
}
