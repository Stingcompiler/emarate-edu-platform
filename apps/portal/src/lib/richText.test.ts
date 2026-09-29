import { describe, expect, it } from "vitest";

import { htmlToText, textToHtml } from "./richText";

describe("rich text round trip (review 2026-09-29, P11)", () => {
  it("keeps paragraphs and line breaks", () => {
    const html = "<p>الفقرة الأولى</p><p>سطر<br>وسطر</p>";
    expect(htmlToText(html)).toBe("الفقرة الأولى\n\nسطر\nوسطر");
    expect(textToHtml(htmlToText(html))).toBe(html);
  });

  it("decodes entities once and escapes once", () => {
    const stored = textToHtml("R&D <لجنة>");
    expect(stored).toBe("<p>R&amp;D &lt;لجنة&gt;</p>");
    expect(htmlToText(stored)).toBe("R&D <لجنة>");
    expect(textToHtml(htmlToText(textToHtml(htmlToText(stored))))).toBe(stored);
  });

  it("reads formatted text as plain paragraphs", () => {
    expect(htmlToText("<p><strong>مهم</strong> جدًا</p><ul><li>أ</li><li>ب</li></ul>")).toBe(
      "مهم جدًا\n\nأ\n\nب",
    );
  });
});
