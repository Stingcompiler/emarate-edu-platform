import { describe, expect, it } from "vitest";

import { matches } from "./search";

describe("matches", () => {
  it("does not tell hamza forms, tāʾ marbūṭa, alif maqṣūra or Latin case apart", () => {
    expect(matches("احمد", "أحمد محمد")).toBe(true);
    expect(matches("فاطمه", "فاطمة علي")).toBe(true);
    expect(matches("مصطفي", "مصطفى")).toBe(true);
    expect(matches("26-it-0001", "محمد", "26-IT-0001")).toBe(true);
    expect(matches(" إدارة ", "ادارة الاعمال")).toBe(true);
  });

  it("matches everything when nothing is typed, and nothing that is absent", () => {
    expect(matches("  ", "أي شيء")).toBe(true);
    expect(matches("سلمى", "أحمد", null, undefined)).toBe(false);
  });
});
