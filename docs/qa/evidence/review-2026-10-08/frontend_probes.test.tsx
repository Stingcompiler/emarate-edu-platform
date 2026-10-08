// Passing probes reproduce current defects. Run temporarily beside TakeExam.test.tsx.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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
  vi.useRealTimers();
  vi.resetAllMocks();
  localStorage.clear();
});
function payload(): AttemptPayload {
  const now = Date.now();
  return {
    public_id: "review",
    exam: {
      public_id: "exam",
      title: "Review",
      course_code: "IT",
      course_name: "Course",
      allow_backtrack: true,
      grace_seconds: 30,
      max_attempts: 1,
    },
    attempt_no: 1,
    status: "in_progress",
    started_at: new Date(now).toISOString(),
    deadline_at: new Date(now + 60000).toISOString(),
    server_time: new Date(now).toISOString(),
    last_saved_at: null,
    questions: [
      { id: 1, type: "true_false", text: "Question", marks: "1", is_required: false, choices: [] },
    ],
    answers: {},
  };
}
function Result() {
  const location = useLocation();
  return <p>submitted: {location.state?.unsent}</p>;
}
function mount(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/exam-attempts/review"]}>
        <Routes>
          <Route path="/exam-attempts/:id" element={<TakeExam />} />
          <Route path="/exam-attempts/:id/result" element={<Result />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it("R09: silently drops HTTP 400 answer and submits without warning", async () => {
  pendingStore("review").put(1, true);
  vi.mocked(api.GET).mockResolvedValue({
    data: payload(),
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.PUT).mockResolvedValue({
    error: { code: "time_up" },
    response: new Response(null, { status: 400 }),
  } as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText("submitted: 0")).toBeTruthy();
  expect(pendingStore("review").read()).toEqual({});
  expect(screen.queryByText(/لم تصل/)).toBeNull();
});
it("R10: does not fetch server extension and auto-submits at old deadline", async () => {
  const old = payload();
  const client = new QueryClient();
  client.setQueryData(["attempt", "review"], old);
  vi.mocked(api.GET).mockResolvedValue({
    data: { ...old, deadline_at: new Date(Date.now() + 600000).toISOString() },
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  vi.useFakeTimers();
  mount(client);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61000);
  });
  expect(api.GET).not.toHaveBeenCalled();
  expect(api.POST).toHaveBeenCalledWith(
    "/api/v1/exam-attempts/{public_id}/submit",
    expect.anything(),
  );
  expect(screen.getByText("submitted: 0")).toBeTruthy();
});

it("R11: offline answers are replayed by numeric ID instead of shuffled question order", async () => {
  const data = payload();
  data.exam.allow_backtrack = false;
  data.questions = [{ ...data.questions[0]!, id: 2 }, data.questions[0]!];
  pendingStore("review").put(2, true);
  pendingStore("review").put(1, false);
  const sent: string[] = [];
  let furthest = -1;
  vi.mocked(api.GET).mockResolvedValue({
    data,
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.PUT).mockImplementation(async (_path, options) => {
    const id = String(options!.params.path.question_id);
    sent.push(id);
    const position = data.questions.findIndex((q) => String(q.id) === id);
    const status = position < furthest ? 400 : 204;
    furthest = Math.max(furthest, position);
    return { response: new Response(null, { status }) } as never;
  });
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText("submitted: 0")).toBeTruthy();
  expect(sent).toEqual(["1", "2"]);
  expect(pendingStore("review").read()).toEqual({});
});
