import { type Locator, type Page, expect, test } from "@playwright/test";

import { lastCode, signIn } from "./helpers";

// Review 2026-11, axis 8 (docs/qa/comprehensive-review-plan-2026-11.md §2): keyboard only and
// Arabic. Checked and OK, so not kept here: the confirm dialog's focus trap and Esc, the
// applicant form's focus order, taking an exam by keyboard, axe AA in warm/dark mode.
// Every probe EXPECTS THE FAULT: a passing probe is a reproduced defect; once fixed, the probe
// fails and becomes the regression test with its assertion reversed.

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

// ───────────────────────────── 1. Form builder ─────────────────────────────

test.describe("form builder (head registrar), keyboard only", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "head.registrar@demo.ecst.test");
    await draftOfDefault(page); // newest version first: the builder opens the draft
    await page.goto("/admissions/forms");
    await expect(page.getByRole("button", { name: "حفظ المسودة" })).toBeVisible();
  });

  test("A11Y-FB1 moving a field with its arrow button drops the keyboard focus", async ({
    page,
  }) => {
    const up = page.getByRole("button", { name: "نقل «النسبة المئوية» للأعلى" });
    await up.focus();
    await page.keyboard.press("Enter");
    // The move happened: «النسبة المئوية» is now second, above «نوع الشهادة».
    const order = await page
      .getByRole("button", { name: /^نقل «.*» للأعلى$/ })
      .evaluateAll((all) => all.map((b) => b.getAttribute("aria-label")));
    expect(order.indexOf("نقل «النسبة المئوية» للأعلى")).toBe(1);
    // FAULT: the row is re-keyed by its index (`${f.key}-${fi}`), React remounts it and the
    // focus falls to the page; a second Enter does nothing.
    expect(await focused(page)).toBe("BODY");
  });

  test("A11Y-FB2 a field cannot be moved to another section without dragging", async ({ page }) => {
    const add = page.getByRole("button", { name: "إضافة قسم" });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("القسم 2", { exact: true })).toBeVisible();
    // The last field of section 1 has a section below it, yet «down» stops at the section's end…
    const down = page.getByRole("button", { name: /^نقل «.*» للأسفل$/ }).last();
    await expect(down).toBeDisabled();
    const label = (await down.getAttribute("aria-label"))!.match(/«(.*)»/)![1]!;
    // …and the field's own editor offers no «section» choice: only drag and drop moves it.
    const toggle = page.getByRole("button", { name: new RegExp(`^${label}`) });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("العنوان الظاهر")).toBeVisible();
    await expect(page.getByRole("combobox", { name: /القسم/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /إلى القسم/ })).toHaveCount(0);
  });

  test("A11Y-FB3 the «أضف حقلًا» list adds a field on the first arrow key", async ({
    page,
    isMobile,
  }) => {
    // Desktop Chromium on macOS opens the list on ArrowDown instead (not reproduced there).
    test.skip(!isMobile, "reproduced with the phone profile only");
    const rows = page.getByRole("button", { name: /^نقل «.*» للأعلى$/ });
    await expect(rows.first()).toBeVisible(); // the draft's fields are drawn
    const before = await rows.count();
    const select = page.getByRole("combobox", { name: /أضف حقلًا/ });
    await select.focus();
    await page.keyboard.press("ArrowDown"); // a keyboard user browsing the types
    // FAULT: onChange adds a field at once, before the person has chosen.
    await expect(rows).toHaveCount(before + 1);
  });
});

// ───────────────────────────── 2. Academic structure ─────────────────────────────

test.describe("academic structure (admin), keyboard only", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "admin@demo.ecst.test");
    await page.goto("/system/structure");
    await expect(page.getByRole("button", { name: "تعديل القسم" })).toBeVisible();
  });

  test("A11Y-ST1 closing the department form with «إلغاء» drops the focus to the page", async ({
    page,
  }) => {
    const edit = page.getByRole("button", { name: "تعديل القسم" });
    await edit.focus();
    await page.keyboard.press("Enter");
    const form = page.locator("form").filter({ hasText: "تعديل قسم «" });
    await expect(form).toBeVisible();
    const cancel = form.getByRole("button", { name: "إلغاء", exact: true });
    expect(await tabUntil(page, cancel, 20)).toBeGreaterThan(0); // reachable by Tab
    await page.keyboard.press("Enter");
    await expect(form).toHaveCount(0);
    // FAULT: the button that had the focus is gone; nothing takes it back to «تعديل القسم».
    expect(await focused(page)).toBe("BODY");
  });

  test("A11Y-ST2 «تعديل البرنامج» opens its form after every programme row, focus stays behind", async ({
    page,
  }) => {
    const edit = page.getByRole("button", { name: "تعديل البرنامج" }).first();
    await edit.focus();
    await page.keyboard.press("Enter");
    const form = page.locator("form").filter({ hasText: "تعديل برنامج «" });
    await expect(form).toBeVisible();
    const code = form.getByLabel("رمز البرنامج");
    // Where the form is when it opens (before the keyboard scrolls to it).
    const inView = await form.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0;
    });
    const presses = await tabUntil(page, code, 60);
    console.log(
      `A11Y-ST2: ${presses} Tab presses from the button to the form; form on screen when opened: ${inView}`,
    );
    // FAULT: the form is drawn below all the department's programmes (Structure.tsx 454-473);
    // the keyboard passes through the other rows' buttons and hours fields first.
    expect(presses).toBeGreaterThan(3);
  });
});

// ───────────────────────────── 3. Profile photo ─────────────────────────────

test("A11Y-PH1 the profile photo picker is reachable but its focus is invisible", async ({
  page,
}) => {
  await signIn(page, "teacher@demo.ecst.test");
  await page.goto("/settings");
  const input = page.locator('input[type="file"]');
  const label = page.locator("label").filter({ has: input });
  await expect(label).toBeVisible();
  const presses = await tabUntil(page, input, 150);
  expect(presses, "the picker is reachable with Tab").toBeGreaterThan(0);
  const whenFocused = await look(label);
  const inputBox = await input.boundingBox();
  // Operable: Space opens the system file dialog.
  const chooser = page.waitForEvent("filechooser", { timeout: 5000 });
  await page.keyboard.press("Space");
  expect(await chooser, "Space opens the file dialog").toBeTruthy();
  await page.keyboard.press("Shift+Tab");
  const whenNot = await look(label);
  console.log(
    `A11Y-PH1: ${presses} Tabs; input box ${JSON.stringify(inputBox)}; label ${whenFocused}`,
  );
  // FAULT: the input is `sr-only` (1×1, clipped), so its outline cannot be seen, and the label
  // around it has no `focus-within` style: nothing on screen shows where the focus is.
  expect(inputBox!.width <= 1 && whenFocused === whenNot).toBe(true);
});

// ───────────────────────────── 4. Applying (visitor) ─────────────────────────────

test.describe("applying (visitor), keyboard only", () => {
  test.beforeAll(async ({ browser }) => {
    // The published form carries a `release` and a `staff` field (owner, 2026-11-01).
    const page = await browser.newPage({ baseURL: test.info().project.use.baseURL });
    await signIn(page, "head.registrar@demo.ecst.test");
    const list: Template[] = (await call(page, "GET", "/api/v1/form-templates?page_size=100"))
      .results;
    const published = list.find((t) => t.name === "default" && t.status === "published");
    if (!JSON.stringify(published?.schema ?? {}).includes('"release"')) {
      const draft = await draftOfDefault(page);
      const schema = structuredClone(draft.schema);
      schema.steps[0].sections[0].fields.push(
        { key: "university_number", type: "text", label: "الرقم الجامعي", audience: "release" },
        { key: "admission_note", type: "text", label: "ملاحظة القبول", audience: "staff" },
      );
      await call(page, "PATCH", `/api/v1/form-templates/${draft.id}`, { schema });
      await call(page, "POST", `/api/v1/form-templates/${draft.id}/publish`);
    }
    await page.close();
  });

  test("A11Y-AP1 a refused submission returns to the form with the focus on the page, not on the first error", async ({
    page,
  }, testInfo) => {
    await startApplication(page, `ap1-${testInfo.project.name}`);
    // Release and staff fields are not the applicant's: not on the form.
    await expect(page.getByLabel(/الرقم الجامعي/)).toHaveCount(0);
    await expect(page.getByLabel(/ملاحظة القبول/)).toHaveCount(0);
    for (const name of ["التالي: المستندات", /^المراجعة/, "إرسال الطلب"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      await button.focus();
      await page.keyboard.press("Enter");
    }
    await expect(
      page.getByRole("alert").filter({ hasText: "أكمل الحقول المعلَّمة" }),
    ).toBeVisible();
    // Each refused field says why, tied to the field.
    const birth = page.getByLabel(/^تاريخ الميلاد/);
    await expect(birth).toHaveAttribute("aria-invalid", "true");
    await expect(birth).toHaveAccessibleDescription(/مطلوب/);
    // FAULT: the step is redrawn and the «إرسال الطلب» button that had the focus is gone; the
    // focus is on the page, so a keyboard user starts again from the top.
    expect(await focused(page)).toBe("BODY");
  });

  test("A11Y-AP2 the document pickers show no keyboard focus", async ({ page }, testInfo) => {
    await startApplication(page, `ap2-${testInfo.project.name}`);
    await page.getByRole("button", { name: "التالي: المستندات" }).focus();
    await page.keyboard.press("Enter");
    const label = page
      .locator("label")
      .filter({ has: page.locator('input[type="file"]') })
      .first();
    const input = label.locator('input[type="file"]');
    await expect(input).toBeAttached();
    const before = await look(label);
    await page.getByRole("button", { name: "رجوع" }).focus(); // a known start, then the keyboard
    const presses = await tabUntil(page, input, 20, "Shift+Tab");
    expect(presses, "reachable with the keyboard").toBeGreaterThan(0);
    const after = await look(label);
    const box = await input.boundingBox();
    // FAULT: as with the profile photo: `sr-only` input, no `focus-within` on its label.
    expect(box!.width <= 1 && before === after).toBe(true);
  });
});

// ───────────────────────────── 5. Theme switch ─────────────────────────────

test("A11Y-TH1 the mode choice does not answer arrow keys", async ({ page, isMobile }) => {
  await signIn(page, "teacher@demo.ecst.test");
  const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (isMobile) {
    const trigger = page.locator("header").getByRole("button", { name: "المظهر" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "المظهر" });
    await expect(menu).toBeVisible();
    const start = await focused(page);
    await page.keyboard.press("ArrowDown");
    const after = await focused(page);
    // Operable with Tab + Enter (precondition).
    await expect(menu.getByRole("menuitemradio", { name: "دافئ" })).toBeVisible();
    console.log(`A11Y-TH1 phone: menu focus ${start} → ArrowDown → ${after}`);
    // FAULT: role="menu" promises arrow keys (WAI-ARIA menu pattern); they do nothing.
    expect(after).toBe(start);
  } else {
    const group = page.getByRole("radiogroup", { name: "المظهر" }).filter({ visible: true });
    const checked = group.getByRole("radio", { checked: true });
    await checked.focus();
    const before = await theme();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    const after = await theme();
    // Tab + Enter does switch it (precondition).
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const switched = await theme();
    console.log(`A11Y-TH1 desktop: ${before} → arrows → ${after}; Tab+Enter → ${switched}`);
    expect(switched).not.toBe(before);
    // FAULT: role="radio" in a radiogroup: arrows should move the choice; every radio is a
    // separate Tab stop instead.
    expect(after).toBe(before);
  }
});

test("A11Y-TH2 choosing a mode or Esc in the phone menu drops the focus to the page", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "the menu is the phone top bar's");
  await signIn(page, "teacher@demo.ecst.test");
  const trigger = page.locator("header").getByRole("button", { name: "المظهر" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  expect(
    await tabUntil(page, page.getByRole("menuitemradio", { name: "داكن" }), 4),
  ).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const afterChoice = await focused(page);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  const afterEsc = await focused(page);
  console.log(`A11Y-TH2: after choosing ${afterChoice}; after Esc ${afterEsc}`);
  // FAULT: the item that had the focus unmounts and the focus is not returned to «المظهر».
  expect([afterChoice, afterEsc]).toEqual(["BODY", "BODY"]);
});

// ───────────────────────────── 6. Arabic ─────────────────────────────

test("A11Y-AR1 the form builder's subtitle shows the template's raw name «default»", async ({
  page,
}) => {
  await signIn(page, "head.registrar@demo.ecst.test");
  await page.goto("/admissions/forms");
  // The chips translate it («الاستمارة الافتراضية»); the page subtitle does not
  // (FormBuilder.tsx:418).
  await expect(page.getByText(/^default · الإصدار \d+$/).filter({ visible: true })).toBeVisible();
});

test("A11Y-AR2 a refused publish shows the server's English sentence", async ({ page }) => {
  await signIn(page, "head.registrar@demo.ecst.test");
  await draftOfDefault(page);
  await page.goto("/admissions/forms");
  // «يظهر حسب …» chosen, but no answer picked yet: check_schema refuses it.
  const toggle = page.getByRole("button", { name: /^المدرسة/ });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("combobox", { name: "الظهور" })
    .selectOption({ label: "يظهر حسب «نوع الشهادة»" });
  await page.getByRole("button", { name: "نشر القالب" }).click();
  const alert = page.getByRole("alert").filter({ hasText: /[A-Za-z]{4,}/ });
  await expect(alert).toBeVisible();
  console.log(`A11Y-AR2: ${await alert.textContent()}`);
  // FAULT: admissions/services.py check_schema() messages are plain English, not gettext.
  await expect(alert).toContainText("choose the answers that show this field");
});
