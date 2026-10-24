import { expect, test } from "@playwright/test";

import { offscreen, signIn } from "./helpers";

// Beyond the navigation pages (sweep.spec.ts): the first pages each of them leads to (a record, a
// course, an application) on a 360px phone, and the main pages again with larger text, as people
// with a bigger font setting see them. Nothing may stick out past its box or the screen.
const ACCOUNTS = [
  "26-IT-0001",
  "teacher@demo.ecst.test",
  "dept.manager@demo.ecst.test",
  "registrar@demo.ecst.test",
  "academic@demo.ecst.test",
  "admin@demo.ecst.test",
];
const LARGE_TEXT = new Set(["26-IT-0001", "teacher@demo.ecst.test", "admin@demo.ecst.test"]);

for (const account of ACCOUNTS) {
  for (const rem of LARGE_TEXT.has(account) ? [16, 20] : [16]) {
    test(`pages fit the screen — ${account}${rem > 16 ? " (larger text)" : ""}`, async ({
      page,
      isMobile,
    }) => {
      test.setTimeout(240_000);
      test.skip(rem > 16 && !isMobile, "larger text is a phone check");
      if (isMobile) await page.setViewportSize({ width: 360, height: 780 });
      await signIn(page, account);
      const more = page.getByRole("button", { name: "المزيد" });
      if (isMobile && (await more.count())) await more.click();
      const links = page.locator("nav a[href^='/']");
      await expect.poll(() => links.count(), { timeout: 15_000 }).toBeGreaterThan(2);
      const navHrefs = await links.evaluateAll((all) => [
        ...new Set(all.map((a) => a.getAttribute("href")!)),
      ]);

      const problems: string[] = [];
      const check = async (href: string) => {
        await page.goto(href);
        await page.waitForLoadState("networkidle");
        // What sits in a closed «details» (a new-record form) counts too: open them all.
        await page.evaluate(() =>
          document.querySelectorAll("details").forEach((d) => (d.open = true)),
        );
        if (rem > 16) await page.addStyleTag({ content: `html { font-size: ${rem}px }` });
        for (const line of await offscreen(page)) problems.push(`${href}: ${line}`);
      };
      for (const href of navHrefs) {
        await check(href);
        // Up to two pages this one leads to, from the content (not the navigation).
        const inside = await page.evaluate(
          (nav) =>
            [
              ...new Set(
                [...document.querySelectorAll<HTMLAnchorElement>("main a[href^='/']")]
                  .map((a) => a.getAttribute("href")!)
                  .filter((h) => !nav.includes(h) && !/print|download|logout|#/.test(h)),
              ),
            ].slice(0, 2),
          navHrefs,
        );
        for (const next of inside) await check(next);
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
