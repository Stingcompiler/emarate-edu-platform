import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("../../lib/visitor", () => ({
  visitorApi: { POST: (...args: unknown[]) => post(...args) },
  saveSession: vi.fn(),
}));

import { VerifyEmail, emailProblem } from "./VerifyEmail";

function show(askName = false, onVerified = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VerifyEmail askName={askName} onVerified={onVerified} />
    </QueryClientProvider>,
  );
  return onVerified;
}

beforeEach(() => post.mockReset());
afterEach(cleanup);

it("says what is wrong with an email, and how to fix it", () => {
  expect(emailProblem("")).toContain("أدخل بريدك");
  expect(emailProblem("ali@")).toContain("name@example.com");
  expect(emailProblem("ali@example")).toContain("name@example.com");
  expect(emailProblem(" ali@example.com ")).toBe("");
});

it("the first screen asks for the email only (design review B3)", () => {
  show(true);
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.queryByLabelText(/الاسم/)).toBeNull();
});

it("shows the problem when the field is left, and never disables the button silently (B2)", () => {
  show();
  const email = screen.getByLabelText("البريد الإلكتروني");
  expect(email.getAttribute("inputmode")).toBe("email");
  fireEvent.change(email, { target: { value: "ali@" } });
  expect(screen.queryByText(/صيغة البريد غير صحيحة/)).toBeNull(); // not while typing
  fireEvent.blur(email);
  expect(screen.getByText(/صيغة البريد غير صحيحة/)).toBeTruthy();
  const button = screen.getByRole("button", { name: "إرسال رمز التحقق" });
  expect((button as HTMLButtonElement).disabled).toBe(false);
});

it("pressing the button with a bad email shows the message and sends nothing", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "إرسال رمز التحقق" }));
  expect(screen.getByText(/أدخل بريدك الإلكتروني ليصلك رمز التحقق/)).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});

it("a good email sends the code, then the name is asked beside the code, after it", async () => {
  post.mockResolvedValueOnce({ response: { ok: true } });
  show(true);
  fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), {
    target: { value: "ali@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "إرسال رمز التحقق" }));
  await waitFor(() => expect(screen.getByLabelText("رمز التحقق")).toBeTruthy());
  expect(post).toHaveBeenCalledWith("/api/public/visitor/otp", {
    body: { email: "ali@example.com" },
  });
  expect(screen.getByLabelText(/الاسم الكامل/)).toBeTruthy();
  // A short code is explained, not silently refused.
  fireEvent.click(screen.getByRole("button", { name: "متابعة" }));
  expect(screen.getByText(/الرمز المكوَّن من 6 أرقام/)).toBeTruthy();
  expect(post).toHaveBeenCalledTimes(1);
});
