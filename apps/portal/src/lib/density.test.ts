import { afterEach, beforeEach, expect, it } from "vitest";

import { applyDensity, storedDensity } from "./density";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-density");
});
afterEach(() => localStorage.clear());

it("comfortable is the default; compact sets the root attribute and is remembered (design review B9)", () => {
  expect(storedDensity()).toBe("comfortable");
  applyDensity("compact");
  expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  expect(storedDensity()).toBe("compact");
  applyDensity("comfortable");
  expect(document.documentElement.hasAttribute("data-density")).toBe(false);
});
