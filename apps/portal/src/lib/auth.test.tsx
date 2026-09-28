import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";
import { RequireAuth } from "./auth";

vi.mock("./api", () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));
const get = vi.mocked(api.GET);

function LoginPage() {
  const location = useLocation();
  return <p>login{location.search}</p>;
}

function renderGuarded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/grading?tab=late"]}>
        <Routes>
          <Route
            path="/grading"
            element={
              <RequireAuth>
                <p>secret page</p>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const reply = (status: number, data?: object) =>
  ({ data, response: new Response(null, { status }) }) as never;

afterEach(() => {
  cleanup();
  get.mockReset();
});

describe("RequireAuth", () => {
  it("shows the page to a signed-in user", async () => {
    get.mockResolvedValue(reply(200, { roles: [] }));
    renderGuarded();
    expect(await screen.findByText("secret page")).toBeTruthy();
  });

  it("sends a signed-out user to login and remembers where they were going", async () => {
    get.mockResolvedValue(reply(401));
    renderGuarded();
    expect(
      await screen.findByText(`login?next=${encodeURIComponent("/grading?tab=late")}`),
    ).toBeTruthy();
  });

  it("keeps the session on a rate limit and offers a retry instead of signing out", async () => {
    get.mockResolvedValueOnce(reply(429));
    renderGuarded();
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    expect(screen.queryByText(/^login/)).toBeNull();
    get.mockResolvedValueOnce(reply(200, { roles: [] }));
    fireEvent.click(retry);
    expect(await screen.findByText("secret page")).toBeTruthy();
  });
});
