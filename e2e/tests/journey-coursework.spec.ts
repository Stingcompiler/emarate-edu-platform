import { type Page, expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Review 2026-11-10 §3, «طالب وأستاذ ومعيد»: an assignment the teacher publishes reaches the
// student's tasks; the student's answer reaches the teacher's grading; the grade and the note
// reach the student. Each side reloads before it checks: the state is stored, not only shown.

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

test("an assignment goes from the teacher to the student and its grade comes back", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const title = `تقرير قصير ${info.project.name} ${Date.now()}`;
  const answer = "الإجابة: المكدس يعمل بمبدأ آخر داخل أول خارج.";

  // The teacher publishes it (setup by the API: the editor has its own tests).
  const staff = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: page.viewportSize(),
    locale: "ar",
  });
  const teacher = await staff.newPage();
  await signIn(teacher, "teacher@demo.ecst.test");
  const offering = (await call(teacher, "GET", "/api/v1/assignments?page_size=1")).results[0]
    .offering;
  const made = await call(teacher, "POST", "/api/v1/assignments", {
    offering,
    title,
    due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    submission_types: ["text"],
    max_grade: "10",
  });
  await call(teacher, "POST", `/api/v1/assignments/${made.public_id}/publish`);

  // The student finds it among the tasks and sends an answer.
  await signIn(page, "26-IT-0001");
  await page.goto("/tasks");
  await page
    .getByRole("link", { name: new RegExp(title) })
    .locator("visible=true")
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/assignments/${made.public_id}`));
  await page.getByLabel("الإجابة / ملاحظة").fill(answer);
  await page.getByRole("button", { name: "إرسال التسليم" }).click();
  await page.reload();
  await expect(page.getByText(answer).locator("visible=true").first()).toBeVisible();

  // The teacher reads the same answer and grades it.
  await teacher.goto(`/assignments/${made.public_id}`);
  await teacher.locator("a[href^='/submissions/']").locator("visible=true").first().click();
  await expect(teacher.getByText(answer).locator("visible=true").first()).toBeVisible();
  await teacher.getByLabel("الدرجة").fill("8");
  await teacher.getByLabel("ملاحظة للطالب").fill("أحسنت، أضف مثالًا.");
  await teacher.getByRole("button", { name: /^اعتماد وحفظ/ }).click();
  await teacher.reload();
  await expect(teacher.getByLabel("الدرجة")).toHaveValue("8");
  await staff.close();

  // The student sees the grade and the note after a reload.
  await page.reload();
  await expect(page.getByText("«أحسنت، أضف مثالًا.»")).toBeVisible();
  await expect(
    page.getByText("8 من 10", { exact: true }).locator("visible=true").first(),
  ).toBeVisible();
});
