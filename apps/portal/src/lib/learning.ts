import type { Schemas } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

export type Assignment = Schemas["Assignment"];
export type Lecture = Schemas["Lecture"];

const H = 3_600_000;
const D = 24 * H;

/** Arabic count of hours: 1 ساعة، 2 ساعتان، 3–10 ساعات، 11+ ساعة. */
const hours = (n: number) =>
  n === 1 ? "ساعة" : n === 2 ? "ساعتين" : n <= 10 ? `${n} ساعات` : `${n} ساعة`;

/** "بعد 6 ساعات" / "متأخر يومين" / "غدًا 10:00" — short, relative, Arabic. */
export function dueLabel(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (diff < 0) {
    if (abs < H) return "انتهى الآن";
    if (abs < D) return `متأخر ${hours(Math.round(abs / H))}`;
    const days = Math.round(abs / D);
    return days === 1 ? "متأخر يومًا" : days === 2 ? "متأخر يومين" : `متأخر ${days} أيام`;
  }
  if (diff < H) return `بعد ${Math.max(1, Math.round(diff / 60_000))} دقيقة`;
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
  const end = a.late_until ? new Date(a.late_until).getTime() : due;
  if (due < now) return end >= now ? "late" : "late";
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
