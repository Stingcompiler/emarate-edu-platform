// QA probe, review 2026-11 axis 1.4 — EXPECTS THE FAULTY BEHAVIOUR (passes = reproduced).
//
// «تسليم الآن» while offline sets wantsSubmit; only the «متابعة الحل» button clears it. Closing
// the same dialog with Escape (useDialogFocus → closeConfirm → setConfirm(false)) leaves it set,
// so the student is back to answering and the exam still submits itself when the connection
// returns. The queued answers are sent first (sync before submit), so none is lost, but the
// student loses the rest of the attempt without pressing «تسليم» again.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

it("PROBE: Escape on the confirm dialog does not call off the pending auto-submit", async () => {
  pendingStore("esc").put(1, true); // an answer that has not reached the server
  vi.mocked(api.GET).mockResolvedValue({
    data: attempt(),
    response: new Response(null, { status: 200 }),
  } as never);
  // Offline: the save does not get through (a 503 here; a real fetch failure throws).
  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 503 }) } as never);
  vi.mocked(api.POST).mockResolvedValue({ response: new Response(null, { status: 200 }) } as never);
  mount();

  fireEvent.click(await screen.findByRole("button", { name: "إنهاء وتسليم" }));
  fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
  expect(await screen.findByText(/يُسلَّم الاختبار تلقائيًا حين يعود الاتصال/)).toBeTruthy();

  // The student changes their mind and closes the dialog with Escape: back to answering.
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();

  // The connection comes back while they are still answering.
  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 204 }) } as never);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });

  // FAULT: the attempt is submitted although the student went back to answering.
  expect(await screen.findByText("submitted")).toBeTruthy();
  const submits = vi
    .mocked(api.POST)
    .mock.calls.filter(([path]) => String(path).endsWith("/submit"));
  expect(submits.length).toBe(1);
  // …after the queued answer was sent (that part is right: nothing is submitted over it).
  expect(api.PUT).toHaveBeenCalled();
  expect(pendingStore("esc").read()).toEqual({});
});

it("CONTROL: «متابعة الحل» does call it off (the intended behaviour)", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "متابعة الحل" }));

  vi.mocked(api.PUT).mockResolvedValue({ response: new Response(null, { status: 204 }) } as never);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(screen.queryByText("submitted")).toBeNull();
  const submits = vi
    .mocked(api.POST)
    .mock.calls.filter(([path]) => String(path).endsWith("/submit"));
  expect(submits.length).toBe(0);
});
