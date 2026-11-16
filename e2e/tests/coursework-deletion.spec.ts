import { type Page, expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Owner, 2026-11-16: the teacher deletes a student's submission (the student may submit again),
// and an assignment students have submitted to goes with their submissions once that is said.

async function call(page: Page, method: string, url: string, body?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const res = await page.request.fetch(url, {
    method,
    headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok(), `${method} ${url}: ${res.status()} ${await res.text()}`).toBe(true);
  return res.status() === 204 ? null : res.json();
}

test("the teacher deletes a submission, then the assignment with the others", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const title = `واجب للحذف ${info.project.name} ${Date.now()}`;
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
  await signIn(page, "26-IT-0001");
  await call(page, "POST", `/api/v1/assignments/${made.public_id}/submit`, { content: "حل أول" });

  // One submission goes; the student may submit again.
  await teacher.goto(`/assignments/${made.public_id}`);
  const row = teacher.locator("[data-submission]").first();
  await expect(row).toBeVisible();
  expect(
    await teacher.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await teacher.screenshot({ path: info.outputPath(`submissions-${info.project.name}.png`) });
  await row.getByRole("button", { name: /^حذف تسليم/ }).click();
  await teacher.getByRole("alertdialog").getByRole("button", { name: "حذف التسليم" }).click();
  await expect(teacher.locator("[data-submission]")).toHaveCount(0);
  await call(page, "POST", `/api/v1/assignments/${made.public_id}/submit`, { content: "حل ثانٍ" });

  // The assignment goes with the submission that is left, once that is said.
  await teacher.reload();
  await teacher.getByRole("button", { name: "حذف الواجب" }).click();
  const dialog = teacher.getByRole("alertdialog");
  await expect(dialog).toContainText("تُحذف تسليماتهم ودرجاتهم");
  await dialog.getByRole("button", { name: "حذف الواجب والتسليمات" }).click();
  await expect(teacher).toHaveURL(new RegExp(`/courses/${offering}`));
  const gone = await teacher.request.get(`/api/v1/assignments/${made.public_id}`);
  expect(gone.status()).toBe(404);
  await staff.close();
});
