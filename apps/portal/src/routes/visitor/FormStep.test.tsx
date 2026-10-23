import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ConnectivityBar } from "../../components/ConnectivityBar";
import { ConfirmProvider } from "../../components/Confirm";

const patch = vi.fn();
vi.mock("../../lib/visitor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/visitor")>()),
  visitorApi: { PATCH: (...a: unknown[]) => patch(...a), POST: vi.fn(), GET: vi.fn() },
}));

import { FormStep } from "./Apply";

const app = {
  public_id: "app-1",
  reference_no: "APP-1",
  program_name: "بكالوريوس تقنية المعلومات",
  full_name: "سلمى",
  email: "s@example.com",
  phone_e164: "",
  answers: {},
  status: "draft",
  form: null,
  required_documents: [],
  documents: [],
  submitted_at: null,
};

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

function show() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConfirmProvider>
          <ConnectivityBar />
          <FormStep app={app as never} onNext={vi.fn()} onChangeProgram={vi.fn()} />
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  patch.mockReset();
  setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("offline: the strip says what is safe, the draft is kept on the device, nothing blocks; online: it goes to the server (design review B1)", async () => {
  patch.mockResolvedValue({ data: { ok: true } });
  show();
  setOnline(false);
  // The strip appears; no dialog, and the status is still a quiet line.
  await waitFor(() => expect(screen.getByText(/جهازك غير متصل الآن/)).toBeTruthy());
  expect(screen.queryByRole("alertdialog")).toBeNull();

  fireEvent.change(screen.getByLabelText("الهاتف"), { target: { value: "+249912345678" } });
  // 1. The local badge (dashed, «pending»): kept on the device, waiting to be sent.
  await waitFor(() => expect(screen.getByText("محفوظة على الجهاز · بانتظار الإرسال")).toBeTruthy());
  expect(JSON.parse(localStorage.getItem("app:app-1")!)).toMatchObject({
    pending: true,
    value: { phone: "+249912345678" },
  });
  expect(patch).not.toHaveBeenCalled();
  // What needs the server says so, under the button.
  expect(
    (screen.getByRole("button", { name: "التالي: المستندات" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByText(/يحتاج اتصالًا بالإنترنت/)).toBeTruthy();

  // 2. The connection returns: it is sent (the page waits a moment after the last keystroke).
  setOnline(true);
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(1), { timeout: 4000 });
  // 3. The server badge replaces the local one, and the strip is gone.
  await waitFor(() => expect(screen.getByText(/محفوظة على الخادم/)).toBeTruthy());
  expect(screen.queryByText("محفوظة على الجهاز · بانتظار الإرسال")).toBeNull();
  expect(screen.queryByText(/جهازك غير متصل الآن/)).toBeNull();
  expect(JSON.parse(localStorage.getItem("app:app-1")!).pending).toBe(false);
});

it("a draft kept on the device survives a reload", () => {
  localStorage.setItem(
    "app:app-1",
    JSON.stringify({
      value: { fullName: "سلمى عثمان", phone: "+249", answers: {} },
      at: Date.now(),
      pending: true,
    }),
  );
  show();
  expect((screen.getByLabelText("الاسم الكامل *") as HTMLInputElement).value).toBe("سلمى عثمان");
  expect(screen.getByText("محفوظة على الجهاز · بانتظار الإرسال")).toBeTruthy();
});
