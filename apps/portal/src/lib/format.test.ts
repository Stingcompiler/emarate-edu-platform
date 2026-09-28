import { describe, expect, it } from "vitest";

import { N, count, slugify } from "./format";

// Digits follow the runtime's Arabic locale (Western or Arabic-Indic), as in the browser.
const d = (n: number) => n.toLocaleString("ar", { maximumFractionDigits: 1 });

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
