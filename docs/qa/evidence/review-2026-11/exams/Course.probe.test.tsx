// QA probe, review 2026-11 axis 1.5 — EXPECTS THE FAULTY BEHAVIOUR (passes = reproduced).
//
// The «عُيّنت على مادة …» notification (backend notifications/events.py instructor_assigned)
// links to /courses/<offering.public_id> (a UUID). This page reads the id as the offering's
// numeric pk (Number(id)), so from that link the course is never loaded and every list asks
// the API for offering=NaN. Backend half: test_probe_instructor_assigned_links_to_the_offering_uuid.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import { Course } from "./Course";

vi.mock("../../lib/api", () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
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

it("PROBE: /courses/<uuid> (the notification's link) never loads the course", async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: { results: [] },
    response: new Response(null, { status: 200 }),
  } as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/courses/3f2b8c1e-5a7d-4e2a-9b1c-0d6e7f8a9b0c"]}>
        <Routes>
          <Route path="/courses/:id" element={<Course />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(api.GET).toHaveBeenCalled());
  const calls = vi.mocked(api.GET).mock.calls as unknown as [string, unknown][];
  // FAULT: the course itself (/api/v1/me/courses?offering=…) is never asked for…
  expect(calls.some(([path]) => path === "/api/v1/me/courses")).toBe(false);
  // …and the lists that are asked for carry offering = NaN.
  const exams = calls.find(([path]) => path === "/api/v1/exams");
  expect(exams).toBeTruthy();
  const query = (exams![1] as { params: { query: { offering: number } } }).params.query;
  expect(Number.isNaN(query.offering)).toBe(true);
});
