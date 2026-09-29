import type { Schemas } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

export type Assignment = Schemas["Assignment"];
export type Lecture = Schemas["Lecture"];

const H = 3_600_000;
const D = 24 * H;

/** A span after «بعد»/«متأخر» (genitive dual): ساعة، ساعتين، 5 ساعات، 15 ساعة. */
const span = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
const hours = (n: number) => span(n, "ساعة", "ساعتين", "ساعات", "ساعة");
const minutes = (n: number) => span(n, "دقيقة", "دقيقتين", "دقائق", "دقيقة");
const days = (n: number) => span(n, "يومًا", "يومين", "أيام", "يومًا");

/** "بعد 6 ساعات" / "متأخر يومين" / "غدًا 10:00" — short, relative, Arabic. */
export function dueLabel(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (diff < 0) {
    if (abs < H) return "انتهى الآن";
    if (abs < D) return `متأخر ${hours(Math.round(abs / H))}`;
    return `متأخر ${days(Math.round(abs / D))}`;
  }
  if (diff < H) return `بعد ${minutes(Math.max(1, Math.round(diff / 60_000)))}`;
  if (diff < D) return `بعد ${hours(Math.round(diff / H))}`;
  const time = new Date(iso).toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" });
  if (diff < 2 * D) return `غدًا ${time}`;
  return new Date(iso).toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export type TaskState = "late" | "today" | "week" | "later" | "submitted" | "graded";

export function taskState(a: Assignment, now = Date.now()): TaskState {
  if (a.mine?.graded) return "graded";
  if (a.mine) return "submitted";
  const due = new Date(a.due_at).getTime();
  // Past due and not submitted is late, inside or after the late window alike.
  if (due < now) return "late";
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);
  if (due <= today.getTime()) return "today";
  if (due - now <= 7 * D) return "week";
  return "later";
}

/** Signed, short-lived link to a private file (docs/05 §8.2), opened in a new tab. */
export async function openFile(publicId: string) {
  const { data } = await api.GET("/api/v1/files/{public_id}/url", {
    params: { path: { public_id: publicId } },
  });
  if (data?.url) window.open(data.url, "_blank", "noopener");
}

export function useMyCourses() {
  return useQuery({
    queryKey: ["me", "courses"],
    queryFn: async () => (await api.GET("/api/v1/me/courses")).data ?? [],
  });
}

/**
 * One course as the signed-in user sees it: a course they teach or study, or — for a
 * department manager/supervisor — any course of their department (`my_role: "manager"`,
 * owner 2026-09-29). `null` when the course is outside the user's reach.
 */
export function useCourse(offering?: number) {
  return useQuery({
    queryKey: ["me", "courses", offering],
    enabled: !!offering,
    queryFn: async () =>
      (await api.GET("/api/v1/me/courses", { params: { query: { offering } } })).data?.[0] ?? null,
  });
}

/** Teaching the course or running its department — not a student, not read-only. */
export function isCourseStaff(course?: { my_role: string } | null): boolean {
  return !!course && course.my_role !== "student" && course.my_role !== "viewer";
}

export function useAssignments(offering?: number) {
  return useQuery({
    queryKey: ["assignments", offering ?? "all"],
    queryFn: async () =>
      (await api.GET("/api/v1/assignments", { params: { query: { offering, page_size: 100 } } }))
        .data?.results ?? [],
  });
}

export function useLectures(offering?: number) {
  return useQuery({
    queryKey: ["lectures", offering ?? "all"],
    queryFn: async () =>
      (await api.GET("/api/v1/lectures", { params: { query: { offering, page_size: 100 } } })).data
        ?.results ?? [],
  });
}

export const splitCourse = (code: string): [string, string] => {
  const m = /^([A-Za-z]+)(.*)$/.exec(code);
  return m ? [m[1] ?? code, m[2] ?? ""] : [code, ""];
};

export const fmtSize = (bytes: number) =>
  bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
