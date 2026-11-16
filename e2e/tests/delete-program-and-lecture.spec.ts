import { type Page, expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./helpers";

// Owner, 2026-11-16: «حذف برنامج يحذف كل ما به … حذف محاضرة يحذف كل ما بها». The department's
// head asks to delete a programme, the system admin approves — the programme goes with its
// students after a backup; a lecture goes with the assignments linked to it and their
// submissions. Each test makes what it deletes.

async function call(page: Page, method: string, url: string, body?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const res = await page.request.fetch(url, {
    method,
    headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.status() < 500, `${method} ${url}: ${res.status()}`).toBe(true);
  return { status: res.status(), json: res.status() === 204 ? null : await res.json() };
}

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
}

test("the department's head asks to delete a programme and the system admin deletes it", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const tag = `${info.project.name === "phone" ? "PP" : "PD"}${Date.now() % 10000}`;
  const staff = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: page.viewportSize(),
    locale: "ar",
  });
  const head = await staff.newPage();
  await signIn(head, "dept.manager@demo.ecst.test");
  const department = (await call(head, "GET", "/api/v1/departments?page_size=1")).json.results[0];

  await signIn(page, "admin@demo.ecst.test");
  const program = await call(page, "POST", "/api/v1/programs", {
    department: department.id,
    code: tag,
    name_ar: `برنامج للحذف ${tag}`,
    degree: "diploma",
    levels_count: 2,
  });
  expect(program.status, JSON.stringify(program.json)).toBe(201);
  const student = await call(page, "POST", "/api/v1/students", {
    full_name_ar: `طالب في ${tag}`,
    program: program.json.id,
    level: 1,
  });
  expect(student.status, JSON.stringify(student.json)).toBe(201);

  // The head asks, with a reason; nothing changes yet.
  await head.goto(`/programs/${program.json.id}`);
  await head.getByRole("button", { name: "طلب حذف البرنامج" }).click();
  const ask = head.getByRole("dialog");
  await expect(ask).toContainText("طلابه وسجلاتهم");
  await noSideScroll(head);
  await head.waitForTimeout(400);
  await head.screenshot({ path: info.outputPath(`ask-program-${info.project.name}.png`) });
  await ask.getByLabel("سبب الحذف").fill("برنامج أُنشئ خطأً");
  await ask.getByRole("button", { name: "أرسل الطلب" }).click();
  await expect(ask).toContainText("وصل طلبك إلى مدير النظام");
  expect((await call(page, "GET", `/api/v1/programs/${program.json.id}`)).status).toBe(200);

  // The system admin approves: the deletion itself, after a backup.
  await page.goto("/system/deletions");
  const card = page
    .locator("div")
    .filter({ hasText: `برنامج للحذف ${tag}` })
    .filter({
      has: page.getByRole("button", { name: "موافقة وحذف" }),
    });
  await card.last().getByRole("button", { name: "موافقة وحذف" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-deletion-counts]")).toContainText("طالب");
  await expect(dialog).toContainText("نسخة احتياطية");
  await dialog.getByLabel(/للتأكيد$/).fill(`برنامج للحذف ${tag}`);
  await dialog.getByLabel("كلمة مرورك في المنصة").fill(PASSWORD);
  await dialog.getByRole("button", { name: "احذف نهائيًا" }).click();
  await expect
    .poll(async () => (await call(page, "GET", `/api/v1/programs/${program.json.id}`)).status, {
      timeout: 90_000,
    })
    .toBe(404);
  await staff.close();
});

test("a lecture goes with the assignments linked to it and their submissions", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const staff = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: page.viewportSize(),
    locale: "ar",
  });
  const teacher = await staff.newPage();
  await signIn(teacher, "teacher@demo.ecst.test");
  const offering = (await call(teacher, "GET", "/api/v1/assignments?page_size=1")).json.results[0]
    .offering;
  const lecture = await call(teacher, "POST", "/api/v1/lectures", {
    offering,
    title_ar: `محاضرة للحذف ${info.project.name}`,
    order: 99,
  });
  expect(lecture.status, JSON.stringify(lecture.json)).toBe(201);
  const id = lecture.json.public_id;
  await call(teacher, "POST", `/api/v1/lectures/${id}/publish`);
  const made = await call(teacher, "POST", "/api/v1/assignments", {
    offering,
    lecture: id,
    title: `واجب المحاضرة ${info.project.name}`,
    due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    submission_types: ["text"],
    max_grade: "10",
  });
  expect(made.status, JSON.stringify(made.json)).toBe(201);
  await call(teacher, "POST", `/api/v1/assignments/${made.json.public_id}/publish`);
  await signIn(page, "26-IT-0001");
  const sent = await call(page, "POST", `/api/v1/assignments/${made.json.public_id}/submit`, {
    content: "حل",
  });
  expect(sent.status, JSON.stringify(sent.json)).toBeLessThan(300);

  await teacher.goto(`/lectures/${id}`);
  await teacher.getByRole("button", { name: "حذف المحاضرة" }).click();
  const dialog = teacher.getByRole("alertdialog");
  await expect(dialog).toContainText("واجب");
  await expect(dialog).toContainText("تسليم");
  await noSideScroll(teacher);
  await teacher.waitForTimeout(400);
  await teacher.screenshot({ path: info.outputPath(`delete-lecture-${info.project.name}.png`) });
  await dialog.getByRole("button", { name: "حذف المحاضرة" }).click();
  await expect(teacher).toHaveURL(new RegExp(`/courses/${offering}`));
  expect((await call(teacher, "GET", `/api/v1/lectures/${id}`)).status).toBe(404);
  expect((await call(teacher, "GET", `/api/v1/assignments/${made.json.public_id}`)).status).toBe(
    404,
  );
  await staff.close();
});
