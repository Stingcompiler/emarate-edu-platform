import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// docs/06 §1: accessibility is a requirement — WCAG AA (contrast, names, roles).
// Serious and critical axe findings fail the build; minor ones are left to review.
async function audit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect(blocking, `${path}\n${blocking.join("\n")}`).toEqual([]);
}

test("public pages: sign-in and application", async ({ page }) => {
  for (const path of ["/login", "/apply", "/register"]) await audit(page, path);
});

const PAGES: Record<string, string[]> = {
  "26-IT-0001": ["/", "/courses", "/tasks", "/me", "/notifications", "/exams"],
  "teacher@demo.ecst.test": [
    "/",
    "/grading",
    "/announcements/new",
    "/lectures/new?offering=4",
    "/assignments/new?offering=4",
  ],
  "dept.manager@demo.ecst.test": ["/department", "/department/courses", "/department/students"],
  "admin@demo.ecst.test": ["/system", "/system/users", "/system/settings", "/system/structure"],
};

for (const [account, paths] of Object.entries(PAGES)) {
  test(`signed-in pages — ${account}`, async ({ page }) => {
    // Six axe audits on a phone profile take ~25s alone; under a loaded machine 30s is too
    // tight and the run fails on time, not on a finding.
    test.setTimeout(60_000);
    await signIn(page, account);
    for (const path of paths) await audit(page, path);
  });
}

test("dark mode keeps AA contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await audit(page, "/login");
  await signIn(page, "26-IT-0001");
  for (const path of ["/", "/courses", "/tasks", "/me"]) await audit(page, path);
});
