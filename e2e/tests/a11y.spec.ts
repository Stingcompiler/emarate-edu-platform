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
  "dept.manager@demo.ecst.test": [
    "/department",
    "/department/courses",
    "/department/students",
    "/department/approvals",
  ],
  "admin@demo.ecst.test": [
    "/system",
    "/system/users",
    "/system/settings",
    "/system/structure",
    "/system/deletions",
    "/system/roles",
    "/admissions/cycles",
  ],
  // Pages added since review 2026-11-10 began (axis 8): with the admin's last three, the staff
  // matrix, promotion and the staff profiles.
  "site@demo.ecst.test": ["/site-staff"],
  "head.registrar@demo.ecst.test": ["/student-promotion"],
  "academic@demo.ecst.test": ["/staff-profiles"],
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

// «ليس حسابي — أبلّغ عن انتحال» (review 2026-11-10, axis 8): the form a student reaches when their
// number already has an account. Reached by the answer the server gives, so no demo account changes.
test("the impersonation report on /register", async ({ page }) => {
  await page.route("**/api/public/registration/start", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ detail: "مسجَّل", code: "already_registered" }),
    }),
  );
  await page.goto("/register");
  await page.getByLabel("التخصص").click();
  await page.getByRole("option").first().click();
  await page.getByLabel("الرقم الجامعي").fill("26-IT-0001");
  await page.getByLabel("الاسم الرباعي").fill("محمد أحمد علي حسن");
  await page.getByLabel("البريد الإلكتروني").fill("someone@example.test");
  await page.getByRole("button", { name: "متابعة", exact: true }).click();
  await expect(page.getByRole("button", { name: "ليس حسابي — أبلّغ عن انتحال" })).toBeVisible();
  // By keyboard: from the email field, Tab reaches the note and then the report button.
  await page.getByLabel("بريدك للتواصل").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("ملاحظة للقسم (اختياري)")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "ليس حسابي — أبلّغ عن انتحال" })).toBeFocused();
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect(blocking, blocking.join("\n")).toEqual([]);
});

test("dark mode keeps AA contrast", async ({ page }) => {
  // Five axe audits, like the signed-in ones above: 30s fails on a loaded machine, not a finding.
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: "dark" });
  await audit(page, "/login");
  await signIn(page, "26-IT-0001");
  for (const path of ["/", "/courses", "/tasks", "/me"]) await audit(page, path);
});

// The warm mode (owner, 2026-10-30) is only ever chosen: the same audits with it pinned.
test("warm mode keeps AA contrast", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("ecst-theme", "warm"));
  await audit(page, "/login");
  await signIn(page, "26-IT-0001");
  for (const path of ["/", "/courses", "/tasks", "/me"]) await audit(page, path);
});
