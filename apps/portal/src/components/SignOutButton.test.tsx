import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => {});
vi.mock("../lib/auth", () => ({ useSignOut: () => signOut }));

import { SignOutButton } from "./SignOutButton";

afterEach(() => {
  cleanup();
  signOut.mockClear();
});

it("«خروج» ends the session and lands on the sign-in page (owner 2026-10-29: for every role)", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<SignOutButton />} />
        <Route path="/login" element={<p>صفحة الدخول</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "خروج" }));
  await waitFor(() => expect(screen.getByText("صفحة الدخول")).toBeTruthy());
  expect(signOut).toHaveBeenCalledTimes(1);
});
