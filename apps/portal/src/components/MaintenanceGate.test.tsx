import { MAINTENANCE_EVENT } from "@ecst/api";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MaintenanceGate } from "./MaintenanceGate";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const answers = (maintenance: boolean) =>
  vi.fn(async () => new Response(JSON.stringify({ maintenance }), { status: 200 }));

describe("MaintenanceGate (owner, 2026-11-14: a backup is being restored)", () => {
  it("shows nothing until the API says the platform is closed", () => {
    render(<MaintenanceGate reopen={() => {}} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("covers the page on the signal and opens it again when the restore is over", async () => {
    const reopen = vi.fn();
    const still = answers(true);
    vi.stubGlobal("fetch", still);
    render(<MaintenanceGate reopen={reopen} />);
    act(() => {
      window.dispatchEvent(new Event(MAINTENANCE_EVENT));
    });
    expect(screen.getByRole("alertdialog").textContent).toContain("المنصة في صيانة قصيرة");

    // Still closed: it keeps waiting.
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(still).toHaveBeenCalledWith("/api/public/maintenance", { cache: "no-store" });
    expect(reopen).not.toHaveBeenCalled();

    // The server restarting answers nothing: asked again, not given up.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(reopen).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", answers(false));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(reopen).toHaveBeenCalledTimes(1);
  });
});
