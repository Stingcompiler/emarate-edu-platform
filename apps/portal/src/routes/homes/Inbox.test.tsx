import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { ListStatus } from "../../components/ui";
import { Inbox, inboxState } from "./Inbox";

afterEach(cleanup);

const row = { n: 3, title: "مواد بلا أستاذ", to: "/x" };
const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

it("never says nothing waits while its sources are still loading (review U07)", () => {
  show(<Inbox items={[]} loading />);
  expect(screen.queryByText("لا شيء بانتظارك.")).toBeNull();
  expect(screen.getByRole("status")).toBeTruthy();
});

it("says a source failed, and retries it, instead of the empty message", () => {
  const retry = vi.fn();
  show(<Inbox items={[]} failed onRetry={retry} />);
  expect(screen.queryByText("لا شيء بانتظارك.")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("تعذّر تحميل");
  fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("keeps the rows it has and warns that some may be missing when a source failed", () => {
  show(<Inbox items={[row]} failed />);
  expect(screen.getByText("مواد بلا أستاذ")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("قد تنقص");
});

it("is empty only once everything loaded without error", () => {
  show(<Inbox items={[]} />);
  expect(screen.getByText("لا شيء بانتظارك.")).toBeTruthy();
});

it("inboxState: loading and failed from the sources, retry refetches only the failed ones", () => {
  const ok = { isLoading: false, isError: false, refetch: vi.fn() };
  const bad = { isLoading: false, isError: true, refetch: vi.fn() };
  const slow = { isLoading: true, isError: false, refetch: vi.fn() };
  const state = inboxState(ok, bad, slow);
  expect(state.loading).toBe(true);
  expect(state.failed).toBe(true);
  state.onRetry();
  expect(bad.refetch).toHaveBeenCalledOnce();
  expect(ok.refetch).not.toHaveBeenCalled();
});

it("ListStatus: loading placeholder, failure, empty text, and nothing when rows are there", () => {
  const { rerender } = render(
    <ListStatus hasItems={false} loading failed={false} empty="لا شيء مجدول" />,
  );
  expect(screen.queryByText("لا شيء مجدول")).toBeNull();
  rerender(<ListStatus hasItems={false} loading={false} failed empty="لا شيء مجدول" />);
  expect(screen.queryByText("لا شيء مجدول")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("تعذّر");
  rerender(<ListStatus hasItems={false} loading={false} failed={false} empty="لا شيء مجدول" />);
  expect(screen.getByText("لا شيء مجدول")).toBeTruthy();
  rerender(<ListStatus hasItems loading={false} failed={false} empty="لا شيء مجدول" />);
  expect(screen.queryByText("لا شيء مجدول")).toBeNull();
});
