import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { test } from "@playwright/test";

import { signIn } from "../../../e2e/tests/helpers";

/**
 * One entry per page to review, in the JSON file named by QA_CAPTURE:
 *   { "name": "exam-take", "path": "/exams/1/take", "account": "26-IT-0001",
 *     "boards": { "phone": "<board>.dc.html", "desktop": "Desktop <board>.dc.html" },
 *     "dark": false }
 * Writes <name>-<project>.png, <name>-<project>-board.png and checks-<project>.jsonl to QA_OUT.
 */
type Entry = {
  name: string;
  path: string;
  account?: string;
  boards?: { phone?: string; desktop?: string };
  dark?: boolean;
};

const ROOT = path.resolve(__dirname, "../../..");
const LIST = process.env.QA_CAPTURE;
const OUT = path.resolve(ROOT, process.env.QA_OUT ?? ".scratch/qa/ui");
const entries: Entry[] = LIST ? JSON.parse(readFileSync(path.resolve(ROOT, LIST), "utf8")) : [];
mkdirSync(OUT, { recursive: true });

test.skip(!LIST, "set QA_CAPTURE to a pages.json file");

for (const entry of entries) {
  test(`capture ${entry.name}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const project = info.project.name;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 500)
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    if (entry.dark) await page.emulateMedia({ colorScheme: "dark" });
    if (entry.account) await signIn(page, entry.account);

    await page.goto(entry.path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(OUT, `${entry.name}-${project}.png`), fullPage: true });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    const axe = await new AxeBuilder({ page }).analyze();
    const serious = axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} ×${v.nodes.length}`);

    const board = project === "phone" ? entry.boards?.phone : entry.boards?.desktop;
    if (board) {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(`http://127.0.0.1:8799/${encodeURI(board)}`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: path.join(OUT, `${entry.name}-${project}-board.png`) });
    }

    appendFileSync(
      path.join(OUT, `checks-${project}.jsonl`),
      JSON.stringify({ name: entry.name, path: entry.path, overflow, serious, errors, board }) +
        "\n",
    );
  });
}
