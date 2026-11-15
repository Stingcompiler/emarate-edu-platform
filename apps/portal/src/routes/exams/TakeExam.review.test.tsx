// Review 2026-11 axis 1.4 (probe in docs/qa/evidence/review-2026-11/exams), the fixed side:
// «تسليم الآن» while offline sets wantsSubmit; only the «متابعة الحل» button clears it. Closing
// the same dialog with Escape (useDialogFocus → closeConfirm → setConfirm(false)) leaves it set,
// so the student is back to answering and the exam still submits itself when the connection
// returns. The queued answers are sent first (sync before submit), so none is lost, but the
// student loses the rest of the attempt without pressing «تسليم» again.
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
  vi.restoreAllMocks();
  localStorage.clear();
});

function attempt(): AttemptPayload {
  const now = new Date();
  return {
    public_id: "esc",
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
    deadline_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
    server_time: now.toISOString(),
    last_saved_at: null,
    questions: [
      { id: 1, type: "true_false", text: "سؤال 1", marks: "1", is_required: false, choices: [] },
      { id: 2, type: "true_false", text: "سؤال 2", marks: "1", is_required: false, choices: [] },
    ],
    answers: {},
  };
}

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/exam-attempts/esc"]}>
        <Routes>
          <Route path="/exam-attempts/:id" element={<TakeExam />} />
          <Route path="/exam-attempts/:id/result" element={<p>submitted</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("Escape on the confirm dialog calls off a submit waiting for the connection", async () => {
  pendingStore("esc").put(1, true);
  vi.mocked(api.GET).mockResolvedValue({
    data: attempt(),
    response: new Response(null, { status: 200 }),
  } as never);
  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 503 }) } as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mount();

  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText(/يُسلَّم الاختبار تلقائيًا حين يعود الاتصال/)).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();

  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 204 }) } as never);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(screen.queryByText("submitted")).toBeNull();
  const calls = vi.mocked(api.POST).mock.calls as unknown as [string][];
  const submits = calls.filter(([path]) => String(path).endsWith("/submit"));
  expect(submits.length).toBe(0);
  // The queued answer still reached the server.
  expect(api.PUT).toHaveBeenCalled();
});

// Review 2026-11-15, R105: the attempt closed while this device was offline (time up, or the
// teacher closed it). Reopened, it goes to the result — saying how many answers never reached
// the server, instead of dropping them in silence — and the device forgets them.
function Result() {
  const state = useLocation().state as { unsent?: number } | null;
  return <p>result unsent={state?.unsent ?? 0}</p>;
}

it("reopening an attempt closed offline says what was never sent", async () => {
  pendingStore("r6").put(1, true);
  vi.mocked(api.GET).mockResolvedValue({
    data: { public_id: "r6", status: "auto_submitted", questions: [], answers: {} },
    response: new Response(null, { status: 200 }),
  } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/exam-attempts/r6"]}>
        <Routes>
          <Route path="/exam-attempts/:id" element={<TakeExam />} />
          <Route path="/exam-attempts/:id/result" element={<Result />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect((await screen.findByText(/result unsent=/)).textContent).toBe("result unsent=1");
  expect(Object.keys(pendingStore("r6").read())).toEqual([]);
});
