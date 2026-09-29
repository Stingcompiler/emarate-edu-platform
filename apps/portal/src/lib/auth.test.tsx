import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";
import { RequireAuth, useSignOut } from "./auth";

vi.mock("./api", () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));
const get = vi.mocked(api.GET);
const post = vi.mocked(api.POST);

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

describe("access (review 2026-09-29)", () => {
  it("shows «غير مسموح» instead of the page to a role outside its audience (P2)", async () => {
    get.mockResolvedValue(reply(200, { roles: [{ role: "student" }] }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/system/users"]}>
          <Routes>
            <Route
              path="/system/users"
              element={
                <RequireAuth allow={() => false} denied={<p>not allowed</p>}>
                  <p>secret page</p>
                </RequireAuth>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("not allowed")).toBeTruthy();
    expect(screen.queryByText("secret page")).toBeNull();
  });

  it("forgets everything on sign-out, the user's own queries included (S1)", async () => {
    post.mockResolvedValue(reply(200));
    const client = new QueryClient();
    client.setQueryData(["me"], { roles: [] });
    client.setQueryData(["me", "results"], { gpa: 3.4 });
    client.setQueryData(["me", "cases"], [{ id: 1 }]);
    client.setQueryData(["courses"], [1, 2]);
    const { result } = renderHook(() => useSignOut(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(() => result.current());
    expect(client.getQueryData(["me", "results"])).toBeUndefined();
    expect(client.getQueryData(["me", "cases"])).toBeUndefined();
    expect(client.getQueryData(["courses"])).toBeUndefined();
    expect(client.getQueryData(["me"])).toBeNull();
  });
});
