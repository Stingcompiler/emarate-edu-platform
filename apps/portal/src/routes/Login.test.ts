import { describe, expect, it } from "vitest";

import { safeNext } from "./Login";

describe("safeNext (review 2026-09-29, S6)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/grading?tab=late")).toBe("/grading?tab=late");
    expect(safeNext("/courses/3#work")).toBe("/courses/3#work");
  });

  it.each([null, "", "grading", "//evil.example/x", "/\\evil.example/x", "https://evil.example"])(
    "sends %s home",
    (value) => {
      expect(safeNext(value)).toBe("/");
    },
  );
});
