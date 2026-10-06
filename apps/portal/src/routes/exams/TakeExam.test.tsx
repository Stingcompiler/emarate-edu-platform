import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import { pendingStore, type AttemptPayload } from "../../lib/exam";
import { TakeExam } from "./TakeExam";

// Review 2026-10-04 C6 (the probe there asserted the fault; this asserts the fix).
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

function attempt(minutesLeft: number): AttemptPayload {
  const now = new Date();
  return {
    public_id: "c6",
    exam: {
      public_id: "exam",
      title: "اختبار",
      course_code: "IT",
      course_name: "مادة",
      allow_backtrack: true,
      grace_seconds: 30,
      max_attempts: 1,
    },
    attempt_no: 1,
    status: "in_progress",
    started_at: now.toISOString(),
    deadline_at: new Date(now.getTime() + minutesLeft * 60_000).toISOString(),
    server_time: now.toISOString(),
    last_saved_at: null,
    questions: [
      { id: 1, type: "true_false", text: "سؤال", marks: "1", is_required: false, choices: [] },
    ],
    answers: {},
  };
}

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/exam-attempts/c6"]}>
        <Routes>
          <Route path="/exam-attempts/:id" element={<TakeExam />} />
          <Route path="/exam-attempts/:id/result" element={<p>submitted</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("does not submit over an answer the server has not confirmed while time remains", async () => {
  pendingStore("c6").put(1, true);
  vi.mocked(api.GET).mockResolvedValue({
    data: attempt(10),
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 503 }) } as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText(/لم تصل 1 إجابة إلى الخادم بعد/)).toBeTruthy();
  expect(api.POST).not.toHaveBeenCalled();
  expect(pendingStore("c6").read()).toEqual({ "1": true }); // still queued, nothing lost
});

it("stays usable when the connection drops during submit", async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: attempt(10),
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.POST).mockRejectedValue(new TypeError("Failed to fetch"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText(/انقطع الاتصال أثناء الإرسال/)).toBeTruthy();
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  fireEvent.click(screen.getByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText("submitted")).toBeTruthy(); // the retry went through
});

it("moves through a single-choice question with the arrow keys (review G2)", async () => {
  const single = attempt(10);
  single.questions = [
    {
      id: 1,
      type: "single",
      text: "سؤال",
      marks: "1",
      is_required: false,
      choices: [
        { id: 11, text: "أ" },
        { id: 12, text: "ب" },
        { id: 13, text: "ج" },
      ],
    } as never,
  ];
  vi.mocked(api.GET).mockResolvedValue({
    data: single,
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 204 }) } as never);
  mount();
  const radios = await screen.findAllByRole("radio");
  expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]); // one Tab stop
  radios[0]!.focus();
  fireEvent.keyDown(radios[0]!, { key: "ArrowDown" });
  expect(radios[1]!.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(radios[1]);
  fireEvent.keyDown(radios[1]!, { key: "ArrowUp" });
  fireEvent.keyDown(radios[0]!, { key: "ArrowUp" }); // wraps to the last
  expect(radios[2]!.getAttribute("aria-checked")).toBe("true");
  expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
});
