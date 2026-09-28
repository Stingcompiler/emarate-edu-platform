import { describe, expect, it } from "vitest";

import { type Assignment, dueLabel, taskState } from "./learning";

const NOW = new Date("2026-09-28T09:00:00+02:00").getTime();
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe("dueLabel", () => {
  it.each([
    [1, "بعد دقيقة"],
    [2, "بعد دقيقتين"],
    [5, "بعد 5 دقائق"],
    [45, "بعد 45 دقيقة"],
    [60, "بعد ساعة"],
    [120, "بعد ساعتين"],
    [6 * 60, "بعد 6 ساعات"],
    [11 * 60, "بعد 11 ساعة"],
  ])("%i minutes ahead → %s", (minutes, text) => {
    expect(dueLabel(at(minutes), NOW)).toBe(text);
  });

  it.each([
    [-10, "انتهى الآن"],
    [-3 * 60, "متأخر 3 ساعات"],
    [-24 * 60, "متأخر يومًا"],
    [-2 * 24 * 60, "متأخر يومين"],
    [-5 * 24 * 60, "متأخر 5 أيام"],
    [-15 * 24 * 60, "متأخر 15 يومًا"],
  ])("%i minutes overdue → %s", (minutes, text) => {
    expect(dueLabel(at(minutes), NOW)).toBe(text);
  });

  it("names tomorrow with its time", () => {
    expect(dueLabel(at(30 * 60), NOW)).toMatch(/^غدًا /);
  });
});

describe("taskState", () => {
  const assignment = (due: string, mine: Assignment["mine"] = null) =>
    ({ due_at: due, late_until: null, mine }) as Assignment;

  it("is graded or submitted before anything else", () => {
    expect(taskState(assignment(at(-60), { graded: true } as never), NOW)).toBe("graded");
    expect(taskState(assignment(at(-60), { graded: false } as never), NOW)).toBe("submitted");
  });

  it("sorts open work by how soon it is due", () => {
    expect(taskState(assignment(at(-60)), NOW)).toBe("late");
    expect(taskState(assignment(at(60)), NOW)).toBe("today");
    expect(taskState(assignment(at(3 * 24 * 60)), NOW)).toBe("week");
    expect(taskState(assignment(at(10 * 24 * 60)), NOW)).toBe("later");
  });
});
