import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import { pendingStore, type AttemptPayload } from "../../lib/exam";
import { TakeExam } from "./TakeExam";

vi.mock("../../lib/api", () => ({
  api: { GET: vi.fn(), PUT: vi.fn(), POST: vi.fn() },
  ok: (reply: { data: unknown }) => reply.data,
  ApiError: class extends Error {},
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("review: blocked localStorage silently loses the queued answer", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  const pending = pendingStore("blocked");
  pending.put(1, "answer");
  expect(pending.read()).toEqual({});
});

it("review: a failed answer save followed by successful submit discards the answer", async () => {
  const now = new Date();
  const attempt: AttemptPayload = {
    public_id: "review",
    exam: {
      public_id: "exam",
      title: "review",
      course_code: "IT",
      course_name: "review",
      allow_backtrack: true,
      grace_seconds: 30,
      max_attempts: 1,
    },
    attempt_no: 1,
    status: "in_progress",
    started_at: now.toISOString(),
    deadline_at: new Date(now.getTime() + 600_000).toISOString(),
    server_time: now.toISOString(),
    last_saved_at: null,
    questions: [
      { id: 1, type: "true_false", text: "question", marks: "1", is_required: false, choices: [] },
    ],
    answers: {},
  };
  pendingStore("review").put(1, true);
  vi.mocked(api.GET).mockResolvedValue({
    data: attempt,
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 503 }) } as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/exam-attempts/review"]}>
        <Routes>
          <Route path="/exam-attempts/:id" element={<TakeExam />} />
          <Route path="/exam-attempts/:id/result" element={<p>submitted</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText("submitted")).toBeTruthy();
  expect(api.PUT).toHaveBeenCalled();
  expect(pendingStore("review").read()).toEqual({});
});
