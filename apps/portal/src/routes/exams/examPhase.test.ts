import { describe, expect, it } from "vitest";

import { examPhase } from "./Exams";

const NOW = new Date("2026-09-28T09:00:00+02:00").getTime();
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const exam = (extra: object = {}) =>
  ({
    status: "published",
    opens_at: hours(-1),
    closes_at: hours(24),
    max_attempts: 1,
    my_attempts: null,
    ...extra,
  }) as never;

describe("examPhase", () => {
  it("follows the exam window", () => {
    expect(examPhase(exam({ status: "draft" }), NOW).key).toBe("draft");
    expect(examPhase(exam({ opens_at: hours(2) }), NOW).key).toBe("open");
    expect(examPhase(exam(), NOW).key).toBe("published");
    expect(examPhase(exam({ closes_at: hours(-0.5) }), NOW).key).toBe("closed");
  });

  it("shows «أنهيته» once a student has used every attempt (walkthrough fix)", () => {
    const done = exam({ my_attempts: [{ status: "submitted" }] });
    expect(examPhase(done, NOW)).toEqual({ key: "closed", label: "أنهيته" });
  });

  it("stays open while an attempt is running or attempts remain", () => {
    expect(examPhase(exam({ my_attempts: [{ status: "in_progress" }] }), NOW).key).toBe(
      "published",
    );
    const second = exam({ max_attempts: 2, my_attempts: [{ status: "submitted" }] });
    expect(examPhase(second, NOW).key).toBe("published");
  });
});
