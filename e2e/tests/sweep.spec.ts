import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Every role, every page its navigation offers: nothing overflows sideways, no serious
// accessibility finding, no script error and no failed API call (docs/05 §11, docs/06 §1).
const ACCOUNTS = [
  "26-IT-0001",
  "teacher@demo.ecst.test",
  "ta@demo.ecst.test",
  "dept.manager@demo.ecst.test",
  "dept.supervisor@demo.ecst.test",
  "head.registrar@demo.ecst.test",
  "registrar@demo.ecst.test",
  "results@demo.ecst.test",
  "academic@demo.ecst.test",
  "student.affairs@demo.ecst.test",
  "hr@demo.ecst.test",
  "site@demo.ecst.test",
  "events@demo.ecst.test",
  "admin@demo.ecst.test",
];

for (const account of ACCOUNTS) {
  test(`every navigation page works — ${account}`, async ({ page, isMobile }) => {
    test.setTimeout(180_000);
    const problems: string[] = [];
    let current = "";
    page.on("pageerror", (error) => problems.push(`${current}: script error ${error.message}`));
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 500)
        problems.push(`${current}: ${response.status()} ${new URL(response.url()).pathname}`);
    });

    await signIn(page, account);
    // The desktop sidebar lists every destination; on the phone the «المزيد» sheet does.
    // Students have exactly five tabs and no «المزيد».
    const more = page.getByRole("button", { name: "المزيد" });
    if (isMobile && (await more.count())) await more.click();
    // The navigation renders once the user is loaded; wait for it before reading links.
    const links = page.locator("nav a[href^='/']");
    await expect.poll(() => links.count(), { timeout: 15_000 }).toBeGreaterThan(2);
    const hrefs = await links.evaluateAll((all) => [
      ...new Set(all.map((a) => a.getAttribute("href")!)),
    ]);

    for (const href of hrefs) {
      current = href;
      await page.goto(href);
      await page.waitForLoadState("networkidle");
      // Every destination a role's navigation offers is within its audience (lib/access.ts).
      if (await page.getByText("هذه الصفحة ليست ضمن صلاحياتك").count())
        problems.push(`${href}: shows «غير مسموح» to a role whose navigation links to it`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 0) problems.push(`${href}: overflows sideways by ${overflow}px`);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      for (const v of violations)
        if (v.impact === "serious" || v.impact === "critical")
          problems.push(`${href}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
