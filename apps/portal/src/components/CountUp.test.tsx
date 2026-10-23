import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CountUp } from "./motion";

beforeEach(() => {
  // jsdom has no matchMedia: report «reduce motion», so the figure is final at once.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("a counter is read once: the animated figure is hidden from assistive technology (design review B8)", () => {
  const { container } = render(<CountUp value={42} />);
  const spans = [...container.querySelectorAll("span")];
  expect(spans).toHaveLength(2);
  const [animated, final] = spans;
  expect(animated!.getAttribute("aria-hidden")).toBe("true");
  expect(final!.getAttribute("aria-hidden")).toBeNull();
  expect(final!.textContent).toBe("42");
});
