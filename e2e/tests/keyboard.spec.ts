import { type Locator, type Page, expect, test } from "@playwright/test";

import { lastCode, signIn } from "./helpers";

// Keyboard use and Arabic messages after review 2026-11 axis 8 (the probes, each expecting the
// old fault, are in docs/qa/evidence/review-2026-11/a11y).

/** What has the keyboard focus, in words («BODY» when focus has fallen to the page). */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "BODY";
    const name = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.getAttribute("type") ? `[${el.getAttribute("type")}]` : ""} «${name}»`;
  });
const hasFocus = (target: Locator) => target.evaluate((el) => el === document.activeElement);

/** Tab presses until `target` has the focus; -1 if it never gets it within `max`. */
async function tabUntil(page: Page, target: Locator, max = 60, key = "Tab") {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press(key);
    if (await hasFocus(target)) return i;
  }
  return -1;
}

/** JSON API call with the signed-in session (setup only, never the behaviour under test). */
async function call(page: Page, method: string, url: string, body?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const res = await page.request.fetch(url, {
    method,
    headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok(), `${method} ${url}: ${res.status()} ${await res.text()}`).toBe(true);
  return res.json();
}

type Template = { id: number; name: string; version: number; status: string; schema: any };
async function newestDefault(page: Page): Promise<Template> {
  const list: Template[] = (await call(page, "GET", "/api/v1/form-templates?page_size=100"))
    .results;
  return list.filter((t) => t.name === "default").sort((a, b) => b.version - a.version)[0]!;
}
async function draftOfDefault(page: Page): Promise<Template> {
  const newest = await newestDefault(page);
  if (newest.status === "draft") return newest;
  return call(page, "POST", `/api/v1/form-templates/${newest.id}/new-version`);
}

/** The visitor verifies an email and starts an application for BIT: lands on the form step. */
async function startApplication(page: Page, tag: string) {
  const email = `a11y-${tag}-${Date.now()}@example.test`;
  await page.goto("/apply?program=BIT");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await page.getByLabel("رمز التحقق").fill(await lastCode(email));
  await page.getByLabel(/الاسم الكامل/).fill("سلمى عثمان الأمين");
  await page.getByRole("button", { name: "متابعة", exact: true }).click();
  await page.getByRole("button", { name: /البرنامج الذي اخترته من الموقع/ }).click();
  await expect(page.getByRole("button", { name: "التالي: المستندات" })).toBeVisible();
}

/** How a box looks: what a focus indicator would change. */
const look = (target: Locator) =>
  target.evaluate((el) => {
    const s = getComputedStyle(el);
    return [
      s.outlineStyle,
      s.outlineWidth,
      s.outlineColor,
      s.boxShadow,
      s.backgroundColor,
      s.borderColor,
      s.textDecorationLine,
    ].join(" | ");
  });

test.describe("form builder by keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "head.registrar@demo.ecst.test");
    await draftOfDefault(page);
    await page.goto("/admissions/forms");
    await expect(page.getByRole("button", { name: "حفظ المسودة" })).toBeVisible();
  });

  test("an arrow keeps the focus on the moved field, and crosses into the next section", async ({
    page,
  }) => {
    // The subtitle names the form in Arabic, not «default».
    await expect(
      page
        .getByText(/^الاستمارة الافتراضية · الإصدار \d+$/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    const up = page.getByRole("button", { name: "نقل «النسبة المئوية» للأعلى" });
    await up.focus();
    await page.keyboard.press("Enter");
    expect(await focused(page)).toContain("النسبة المئوية");
    await page.getByRole("button", { name: "إضافة قسم" }).click();
    const last = page.getByRole("button", { name: /^نقل «.*» إلى القسم التالي$/ }).last();
    await expect(last).toBeEnabled();
  });

  test("a refused publish speaks Arabic and names the field", async ({ page }) => {
    await page.getByRole("button", { name: /^المدرسة/ }).click();
    await page
      .getByRole("combobox", { name: "الظهور" })
      .selectOption({ label: "يظهر حسب «نوع الشهادة»" });
    await page.getByRole("button", { name: "نشر القالب" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "اختر الإجابات التي تُظهر" }),
    ).toBeVisible();
  });
});

test("structure forms give the focus back to the button that opened them", async ({ page }) => {
  await signIn(page, "admin@demo.ecst.test");
  await page.goto("/system/structure");
  const edit = page.getByRole("button", { name: "تعديل القسم" });
  await edit.focus();
  await page.keyboard.press("Enter");
  // The form takes the focus when it opens.
  await expect(page.getByLabel("رمز القسم").last()).toBeFocused();
  await page
    .locator("form")
    .filter({ hasText: "تعديل قسم «" })
    .getByRole("button", { name: "إلغاء", exact: true })
    .click();
  await expect(edit).toBeFocused();
});

test("the phone theme menu answers arrows and gives the focus back", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the menu is the phone top bar's");
  await signIn(page, "teacher@demo.ecst.test");
  const trigger = page.locator("header").getByRole("button", { name: "المظهر" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const start = await focused(page);
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).not.toBe(start);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
