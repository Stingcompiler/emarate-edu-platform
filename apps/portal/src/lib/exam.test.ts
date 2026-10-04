import { afterEach, describe, expect, it, vi } from "vitest";

import { formatClock, pendingStore, textParts } from "./exam";

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

describe("pendingStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("keeps unsent answers on the device and drops them once confirmed", () => {
    const store = pendingStore("a1");
    store.put(1, "x");
    store.put(2, true);
    expect(pendingStore("a1").read()).toEqual({ "1": "x", "2": true }); // survives a reload
    store.done(1, "y"); // an older value confirmed: the newer one stays queued
    store.done(2, true);
    expect(store.read()).toEqual({ "1": "x" });
    expect(store.persisted()).toBe(true);
  });

  it("still queues in memory when the browser refuses storage (review C7)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "QuotaExceededError");
    });
    const store = pendingStore("a2");
    store.put(1, "answer");
    expect(store.read()).toEqual({ "1": "answer" });
    expect(store.persisted()).toBe(false);
  });
});
