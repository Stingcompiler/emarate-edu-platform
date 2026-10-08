import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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
  vi.useRealTimers();
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

// Review 2026-10-08 (the probes there asserted the faults; these assert the fixes).
function ResultState() {
  const state = useLocation().state as { unsent?: number; rejected?: number } | null;
  return (
    <p>
      result unsent={state?.unsent ?? 0} rejected={state?.rejected ?? 0}
    </p>
  );
}

function mountWithState(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/exam-attempts/c6"]}>
        <Routes>
          <Route path="/exam-attempts/:id" element={<TakeExam />} />
          <Route path="/exam-attempts/:id/result" element={<ResultState />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Lets fake time pass a second at a time, so React renders between the steps. */
async function seconds(n: number) {
  for (let i = 0; i < n; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
}

/** The attempt for its own path; the clock answers from `clocks` in turn (the last repeats). */
function serve(data: AttemptPayload, clocks: Partial<AttemptPayload>[] = []) {
  vi.mocked(api.GET).mockImplementation((async (path: string) => {
    if (!path.endsWith("/clock")) return { data, response: new Response(null, { status: 200 }) };
    const next = clocks.length > 1 ? clocks.shift()! : (clocks[0] ?? {});
    return {
      data: {
        status: data.status,
        deadline_at: data.deadline_at,
        server_time: new Date().toISOString(),
        ...next,
      },
      response: new Response(null, { status: 200 }),
    };
  }) as never);
}

it("R09: tells the student about an answer the server refused, before and after submitting", async () => {
  pendingStore("c6").put(1, true);
  serve(attempt(10));
  vi.mocked(api.PUT).mockResolvedValue({
    error: { code: "time_up" },
    response: new Response(null, { status: 400 }),
  } as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mountWithState();
  expect(await screen.findByText(/لم يقبل الخادم إجابة واحدة ولن تُحتسب/)).toBeTruthy();
  expect(screen.getByText(/السؤال 1: وصلت بعد انتهاء الوقت/)).toBeTruthy();
  expect(pendingStore("c6").read()).toEqual({}); // no endless retries
  fireEvent.click(screen.getByRole("button", { name: "إنهاء وتسليم" }));
  expect(screen.getByText(/السبب مذكور أسفل السؤال/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText("result unsent=0 rejected=1")).toBeTruthy();
});

it("R10: asks the server at the deadline and keeps going after a teacher's extension", async () => {
  vi.useFakeTimers();
  const data = attempt(20 / 60); // 20 seconds left
  const extended = new Date(Date.now() + 10 * 60_000).toISOString();
  serve(data, [{}, { deadline_at: extended }]); // the extension shows up only at the deadline
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mountWithState();
  await seconds(25);
  expect(api.GET).toHaveBeenCalledWith(
    "/api/v1/exam-attempts/{public_id}/clock",
    expect.anything(),
  );
  expect(api.POST).not.toHaveBeenCalledWith(
    "/api/v1/exam-attempts/{public_id}/submit",
    expect.anything(),
  );
  expect(screen.getByText(/^09:\d\d$/)).toBeTruthy(); // the timer shows the new deadline
  vi.useRealTimers();
});

it("R10: leaves for the result when the teacher closes the attempt", async () => {
  vi.useFakeTimers();
  serve(attempt(10), [{}, { status: "auto_submitted" }]);
  mountWithState();
  await seconds(31); // one poll
  expect(screen.getByText("result unsent=0 rejected=0")).toBeTruthy();
  vi.useRealTimers();
});

it("R11: replays queued answers in the attempt's shuffled order", async () => {
  const data = attempt(10);
  data.exam.allow_backtrack = false;
  data.questions = [{ ...data.questions[0]!, id: 2 }, data.questions[0]!]; // shuffled: 2 then 1
  pendingStore("c6").put(1, false);
  pendingStore("c6").put(2, true);
  const sent: string[] = [];
  let furthest = -1;
  serve(data);
  vi.mocked(api.PUT).mockImplementation((async (
    _path: string,
    options: { params: { path: { question_id: string } } },
  ) => {
    const qid = String(options.params.path.question_id);
    sent.push(qid);
    const position = data.questions.findIndex((q) => String(q.id) === qid);
    const status = position < furthest ? 400 : 204; // the server's «no going back»
    furthest = Math.max(furthest, position);
    return {
      error: status === 400 ? { code: "no_backtrack" } : undefined,
      response: new Response(null, { status }),
    };
  }) as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mountWithState();
  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText("result unsent=0 rejected=0")).toBeTruthy();
  expect(sent).toEqual(["2", "1"]);
});
