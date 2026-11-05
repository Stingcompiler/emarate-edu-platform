// Review 2026-11 axis 1.4 (probe in docs/qa/evidence/review-2026-11/exams), the fixed side:
// A late policy («يُقبل بخصم» or «يُقبل ويُعلَّم متأخرًا») with no «آخر موعد للمتأخر»
// (late_until = null; the editor allows it) is open without end on the server
// (learning/services.py _lateness; backend probe
// test_probe_penalty_without_late_until_is_accepted_by_the_server). The page takes
// hardEnd = due when late_until is null and tells the student «أُغلق التسليم», with no form.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import { Assignment } from "./Assignment";

vi.mock("../../lib/api", () => ({
  api: { GET: vi.fn(), POST: vi.fn() },
  ok: (reply: { data: unknown }) => reply.data,
  okOrNone: (reply: { data: unknown; response: Response }) =>
    reply.response.status === 404 ? null : reply.data,
  ApiError: class extends Error {},
}));
vi.mock("../../components/PortalShell", () => ({
  PortalShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DAY = 86_400_000;

function assignment(extra: Record<string, unknown>) {
  return {
    public_id: "a1",
    offering: 7,
    course_code: "IT101",
    course_name: "برمجة",
    title: "واجب",
    description: "",
    type: "homework",
    opens_at: null,
    due_at: new Date(Date.now() - 2 * DAY).toISOString(), // two days past due
    late_until: null,
    late_policy: "penalty",
    late_penalty_percent: 20,
    max_grade: "10",
    submission_types: ["text"],
    allowed_extensions: [],
    max_file_size_mb: 20,
    max_files: 3,
    allow_resubmission: true,
    grading_mode: "manual",
    link_fields: [],
    status: "published",
    mine: null,
    ...extra,
  };
}

function mount(a: Record<string, unknown>, mine: unknown) {
  vi.mocked(api.GET).mockImplementation((async (path: string) => {
    if (path === "/api/v1/assignments/{public_id}")
      return { data: a, response: new Response(null, { status: 200 }) };
    if (path === "/api/v1/assignments/{public_id}/my-submission")
      return mine
        ? { data: mine, response: new Response(null, { status: 200 }) }
        : { data: undefined, response: new Response(null, { status: 404 }) };
    if (path === "/api/v1/me/courses")
      return { data: [{ my_role: "student" }], response: new Response(null, { status: 200 }) };
    return { data: null, response: new Response(null, { status: 200 }) };
  }) as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/assignments/a1"]}>
        <Routes>
          <Route path="/assignments/:id" element={<Assignment />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("a late window saved without an end stays open, as on the server", async () => {
  mount(assignment({}), null);
  expect(await screen.findByText(/بعد الموعد — يُقبل بخصم 20٪/)).toBeTruthy();
  expect(screen.queryByText("أُغلق التسليم")).toBeNull();
  expect(screen.queryByText(/حتى/)).toBeNull();
});

it("with an end date the late window is open and says the penalty", async () => {
  mount(assignment({ late_until: new Date(Date.now() + DAY).toISOString() }), null);
  expect(await screen.findByText(/بعد الموعد — يُقبل بخصم 20٪/)).toBeTruthy();
  expect(screen.queryByText("أُغلق التسليم")).toBeNull();
});

it("the late-penalty line matches final_score (server: 10 × 0.8 = 8.00)", async () => {
  const mine = {
    public_id: "s1",
    current_version: {
      version_no: 1,
      content: "حل",
      files: [],
      links: {},
      submitted_at: new Date().toISOString(),
      is_late: true,
    },
    versions_count: 1,
    grade: { score: "10.00", final_score: "8.00", status: "approved", feedback: "" },
  };
  mount(assignment({ late_until: new Date(Date.now() + DAY).toISOString() }), mine);
  expect(await screen.findByText(/بعد خصم التأخير 20٪ من 10/)).toBeTruthy();
});
