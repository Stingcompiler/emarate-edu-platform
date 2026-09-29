import { describe, expect, it } from "vitest";

import { N, count, fmtDate, slugify, when } from "./format";

// Digits are Western everywhere (docs/06), whatever the browser's Arabic default.
const d = (n: number) => n.toLocaleString("ar-u-nu-latn", { maximumFractionDigits: 1 });

describe("count — Arabic number–noun agreement", () => {
  it.each([
    [1, "سؤال"],
    [3, "أسئلة"],
    [10, "أسئلة"],
    [11, "سؤالًا"],
    [99, "سؤالًا"],
    [100, "سؤال"],
  ])("%i questions → number + %s", (n, word) => {
    expect(count(n, N.question)).toBe(`${d(n)} ${word}`);
  });

  it("says two with the dual alone", () => {
    expect(count(2, N.question)).toBe("سؤالان");
  });

  it("shows a dash when the number is unknown", () => {
    expect(count(null, N.day)).toBe("—");
    expect(count(undefined, N.day)).toBe("—");
  });

  it("keeps one decimal for averages", () => {
    expect(count(4.9, N.day)).toBe(`${d(4.9)} يوم`);
  });
});

describe("slugify", () => {
  it("keeps Arabic letters and joins words with dashes", () => {
    expect(slugify("  افتتاح معمل الحاسوب الجديد ")).toBe("افتتاح-معمل-الحاسوب-الجديد");
  });

  it("drops punctuation and collapses separators", () => {
    expect(slugify("Open Day — 2026!!")).toBe("open-day-2026");
    expect(slugify("a  _ b")).toBe("a-b");
  });

  it("respects the maximum length", () => {
    expect(slugify("x".repeat(200), 120)).toHaveLength(120);
  });
});

describe("when and fmtDate (review 2026-09-29)", () => {
  const now = new Date(2026, 8, 29, 12, 0); // Tuesday 29 September 2026, noon

  it("words far future times as a day, not hours", () => {
    expect(when(new Date(2026, 8, 29, 15, 0).toISOString(), now)).toMatch(/3 ساعات/);
    expect(when(new Date(2026, 8, 30, 10, 0).toISOString(), now)).toMatch(/^غدًا /);
    expect(when(new Date(2026, 9, 3, 9, 0).toISOString(), now)).toMatch(/^السبت /);
    expect(when(new Date(2026, 9, 20, 9, 0).toISOString(), now)).toBe("20 أكتوبر");
    expect(when(new Date(2026, 9, 4, 9, 0).toISOString(), now)).not.toMatch(/ساعة/);
  });

  it("says yesterday with the time", () => {
    expect(when(new Date(2026, 8, 28, 15, 5).toISOString(), now)).toMatch(/^أمس /);
  });

  it("uses Western digits and one full date format", () => {
    expect(fmtDate("2026-09-01")).toBe("1 سبتمبر 2026");
    expect(fmtDate("2027-01-31T10:00:00Z")).toMatch(/^31 يناير 2027$/);
    expect(fmtDate(null)).toBe("—");
    expect(count(3, N.student)).toBe("3 طلاب");
  });
});
