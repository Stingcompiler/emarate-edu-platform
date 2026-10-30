import { expect, it } from "vitest";

import { siteUrl } from "./site";

it("a site path never repeats the language (/ar//ar/ was a 404)", () => {
  const url = siteUrl("/ar/contact/");
  expect(url).toMatch(/\/ar\/contact\/$/);
  expect(url).not.toContain("/ar//");
  expect(url.match(/\/ar\//g)).toHaveLength(1);
});
