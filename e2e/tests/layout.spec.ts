import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Owner rule: every page works on the phone and on large screens. The cheapest guard that
// catches most breakage is "nothing overflows sideways" on each role's main pages.
const PAGES: Record<string, string[]> = {
  "26-IT-0001": ["/", "/courses", "/tasks", "/notifications", "/me", "/exams"],
  "teacher@demo.ecst.test": ["/", "/grading", "/courses", "/announcements"],
  "dept.manager@demo.ecst.test": [
    "/department",
    "/department/courses",
    "/department/students",
    "/department/audit",
    "/reports",
  ],
  "admin@demo.ecst.test": [
    "/system",
    "/system/users",
    "/system/structure",
    "/system/settings",
    "/audit",
  ],
};

for (const [account, paths] of Object.entries(PAGES)) {
  test(`no sideways overflow — ${account}`, async ({ page }) => {
    await signIn(page, account);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  });
}
