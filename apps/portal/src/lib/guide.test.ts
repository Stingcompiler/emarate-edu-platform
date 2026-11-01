import { expect, it } from "vitest";

import { exampleText, explain } from "./guide";

it("explains every field with an example even when the registrar wrote nothing (owner, 2026-11-01)", () => {
  // The form on production before the college template: fields with no help at all.
  const date = explain({ key: "birth_date", type: "date", label: "تاريخ الميلاد", required: true });
  expect(date.help).toMatch(/شهادة الميلاد/);
  expect(date.how[0]).toMatch(/التقويم/);
  expect(exampleText({ key: "birth_date", type: "date", label: "" }, date.example!)).toBe(
    "01/05/2008",
  );
  expect(date.required).toBe("مطلوب");

  const choice = explain({
    key: "certificate_type",
    type: "select",
    label: "نوع الشهادة",
    options: ["سودانية", "عربية"],
  });
  expect(choice.how[0]).toBe("اختر واحدًا من القائمة: سودانية، عربية.");
  expect(choice.example).toBe("سودانية");
  expect(choice.required).toMatch(/^اختياري/);

  const pct = explain({ key: "percentage", type: "number", label: "النسبة", min: 0, max: 100 });
  expect(pct.how[0]).toMatch(/بين 0 و100/);
  expect(pct.example).toBe("82.5");

  // An unknown text field still says what to write; the registrar's own words win.
  expect(explain({ key: "x", type: "text", label: "اسم المدرسة" }).help).toMatch(/«اسم المدرسة»/);
  expect(explain({ key: "school", type: "text", label: "", help: "نص المسجل" }).help).toBe(
    "نص المسجل",
  );
  const doc = explain({ key: "id", type: "file", label: "الهوية", required: true, max_mb: 3 });
  expect(doc.help).toMatch(/البطاقة القومية/);
  expect(doc.how[0]).toMatch(/PDF أو JPG أو PNG حتى 3 ميغابايت/);
  const conditional = explain({
    key: "previous_university",
    type: "text",
    label: "",
    required: true,
    show_if: { key: "p", in: ["تجسير"] },
  });
  expect(conditional.required).toBe("مطلوب حين يظهر");
  expect(explain({ key: "p", type: "phone", label: "" }).example).toBe("+249912345678");
});
