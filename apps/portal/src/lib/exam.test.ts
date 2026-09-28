import { describe, expect, it } from "vitest";

import { formatClock, textParts } from "./exam";

describe("formatClock", () => {
  it.each([
    [0, "00:00"],
    [-5_000, "00:00"],
    [1, "00:01"], // rounds up: a running clock never shows 00:00 early
    [65_000, "01:05"],
    [3_600_000, "1:00:00"],
    [3_723_000, "1:02:03"],
  ])("%i ms → %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe("textParts", () => {
  it("splits a question into prose and code blocks", () => {
    expect(textParts("ما ناتج الكود؟\n```\nprint(1)\n```\nاشرح.")).toEqual([
      { code: false, value: "ما ناتج الكود؟" },
      { code: true, value: "print(1)" },
      { code: false, value: "اشرح." },
    ]);
  });

  it("leaves plain text as one part", () => {
    expect(textParts("سؤال بلا كود")).toEqual([{ code: false, value: "سؤال بلا كود" }]);
  });
});
