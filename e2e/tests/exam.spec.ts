import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// One attempt per student and one student account in the demo data: students take exams on
// their phones, so this flow runs on the phone project only.
test.skip(({ isMobile }) => !isMobile, "students take exams on the phone");

test("a student takes the open quiz, submits it and sees the auto-graded result", async ({
  page,
}) => {
  await signIn(page, "26-IT-0001");

  await page.getByText("اختبار قصير 1 — أساسيات البرمجة").first().click();
  await page.getByRole("button", { name: "ابدأ الاختبار" }).click();
  await expect(page).toHaveURL(/\/exam-attempts\//);

  // 1. Single choice — the code block is shown with the question.
  await expect(page.getByText("print(len(x))")).toBeVisible();
  // Choices read "A 3", "B 4"…; the letters may be shuffled, so match the text.
  const choice = (role: "radio" | "checkbox", text: string) =>
    page.getByRole(role, { name: new RegExp(`^[A-Z] ${text}$`) });
  await choice("radio", "3").click();
  await page.getByRole("button", { name: "التالي" }).click();
  // 2. Multiple choice.
  for (const option of ["int", "str", "float"]) {
    await choice("checkbox", option).click();
  }
  await page.getByRole("button", { name: "التالي" }).click();
  // 3. True / false.
  await page.getByRole("radio", { name: "خطأ", exact: true }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  // 4. Fill in the blank.
  await page.getByRole("textbox").fill("print");
  await page.getByRole("button", { name: "التالي" }).click();
  // 5. Essay — graded by the teacher later.
  await page.getByRole("textbox").fill("القائمة قابلة للتعديل والصف غير قابل للتعديل.");
  await page.getByRole("button", { name: "المراجعة" }).click();

  await page.getByRole("button", { name: /^إرسال الاختبار/ }).click();
  await page.getByRole("button", { name: "تسليم الآن" }).click();

  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByText("نتيجة الاختبار").first()).toBeVisible();
  // Four auto-graded questions right (2 + 2 + 1 + 1); the essay waits for the teacher.
  await expect(page.getByText(/^6\s*\/\s*10$|^6$/).first()).toBeVisible();
});
