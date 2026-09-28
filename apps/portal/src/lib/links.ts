/** Portal paths that exist today. Notification links to pages from later
 *  phases are kept (they open once those pages ship) but not followed yet. */
const BUILT = [
  "/notifications",
  "/settings",
  "/install",
  "/results",
  "/result-imports",
  "/result-corrections",
  "/regulations",
  "/cases",
  "/exams",
  "/exam-attempts",
  "/live",
  "/announcements",
  "/inquiries",
  "/site",
  "/events",
  "/applications",
  "/admissions",
  "/reports",
  "/hr",
  "/hr-notices",
  "/transcripts",
  "/print",
  "/courses",
  "/lectures",
  "/assignments",
  "/submissions",
  "/tasks",
  "/grading",
];

export function isBuiltPath(path: string): boolean {
  return BUILT.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}
