import { test } from "@playwright/test";

import { signIn } from "./helpers";

// Review screenshots (docs/ui-profile.md): `pnpm shots <label>` writes
// shots/<label>/<screen>--<width>--<scheme>.png for the representative screens. Skipped
// unless SHOTS is set, so CI never runs it. Motion is reduced and the clock is fixed.
const LABEL = process.env.SHOTS;
test.skip(!LABEL, "set SHOTS=<label> (pnpm shots <label>)");
test.describe.configure({ mode: "serial" });

const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
] as const;
const SCHEMES = ["light", "dark"] as const;
// [screen, account, path]
const SCREENS: [string, string, string][] = [
  ["student-today", "26-IT-0001", "/"],
  ["student-courses", "26-IT-0001", "/courses"],
  ["student-exams", "26-IT-0001", "/exams"],
  ["teacher-today", "teacher@demo.ecst.test", "/"],
  ["department-home", "dept.manager@demo.ecst.test", "/"],
  ["registrar-home", "registrar@demo.ecst.test", "/"],
  ["admin-home", "admin@demo.ecst.test", "/"],
  ["admin-users", "admin@demo.ecst.test", "/system/users"],
  ["results-home", "results@demo.ecst.test", "/"],
  ["affairs-home", "student.affairs@demo.ecst.test", "/"],
  ["site-home", "site@demo.ecst.test", "/"],
];

test("screens", async ({ browser, isMobile }) => {
  test.skip(isMobile, "one browser; viewports are set below");
  test.setTimeout(30 * 60_000);
  for (const [name, account, path] of SCREENS) {
    const context = await browser.newContext({ reducedMotion: "reduce", locale: "ar" });
    const page = await context.newPage();
    await signIn(page, account);
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.addInitScript((value) => localStorage.setItem("ecst-theme", value), scheme);
      for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `shots/${LABEL}/${name}--${size.name}--${scheme}.png`,
          fullPage: true,
        });
      }
    }
    await context.close();
  }
});
