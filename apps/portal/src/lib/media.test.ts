import { expect, it } from "vitest";

import { altNeedsWork } from "./media";

it("flags an empty alt text and the file names an upload used to leave there (review U04)", () => {
  expect(altNeedsWork("")).toBe(true);
  expect(altNeedsWork(null)).toBe(true);
  expect(altNeedsWork("photo_2026-10-13 17.13.54")).toBe(true);
  expect(altNeedsWork("IMG_0042.jpg")).toBe(true);
  expect(altNeedsWork("2026-10-13 17.13.54")).toBe(true);
  expect(altNeedsWork("Screenshot 2026-10-13")).toBe(true);
});

it("accepts a real description in Arabic or English", () => {
  expect(altNeedsWork("طلاب في مختبر الحاسوب")).toBe(false);
  expect(altNeedsWork("Students in the computer lab")).toBe(false);
  expect(altNeedsWork("مبنى الكلية 2026")).toBe(false);
});
