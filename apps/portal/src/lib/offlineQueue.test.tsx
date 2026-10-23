import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readDraft, writeDraft, markSynced } from "./localDraft";
import { useOfflineQueue } from "./offlineQueue";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

beforeEach(() => {
  localStorage.clear();
  setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("sends at once when online and keeps nothing", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useOfflineQueue<string>({ storageKey: "q:a", send }));
  act(() => result.current.enqueue("مرحبًا"));
  await waitFor(() => expect(send).toHaveBeenCalledWith("مرحبًا"));
  await waitFor(() => expect(result.current.pending).toHaveLength(0));
  expect(localStorage.getItem("q:a")).toBeNull();
});

it("keeps a message offline, on the device, and sends it when the connection returns", async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValue(undefined);
  const { result } = renderHook(() => useOfflineQueue<string>({ storageKey: "q:b", send }));
  setOnline(false);
  act(() => result.current.enqueue("رسالة"));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  // The network failure keeps it, listed as pending and persisted for a reload.
  expect(result.current.pending.map((p) => p.item)).toEqual(["رسالة"]);
  expect(JSON.parse(localStorage.getItem("q:b")!)).toHaveLength(1);
  // A new session sees it too.
  const again = renderHook(() => useOfflineQueue<string>({ storageKey: "q:b", send: vi.fn() }));
  expect(again.result.current.pending).toHaveLength(1);
  again.unmount();
  // The connection returns: it is sent, and the queue empties.
  setOnline(true);
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.pending).toHaveLength(0));
  expect(localStorage.getItem("q:b")).toBeNull();
});

it("sends in order and drops what the server refuses, telling the caller", async () => {
  const refusal = { status: 400 };
  const send = vi.fn(async (item: string) => {
    if (item === "bad") throw refusal;
  });
  const { result } = renderHook(() => useOfflineQueue<string>({ storageKey: "q:c", send }));
  act(() => {
    result.current.enqueue("first");
  });
  await waitFor(() => expect(result.current.pending).toHaveLength(0));
  act(() => result.current.enqueue("bad"));
  await waitFor(() => expect(result.current.refused).toBe(refusal));
  expect(result.current.pending).toHaveLength(0); // not retried forever
  expect(send.mock.calls.map((c) => c[0])).toEqual(["first", "bad"]);
});

it("local drafts: written, read back, marked synced, safe without storage", () => {
  expect(readDraft("x")).toBeNull();
  writeDraft("x", { fullName: "سلمى" }, true);
  expect(readDraft<{ fullName: string }>("x")).toMatchObject({
    value: { fullName: "سلمى" },
    pending: true,
  });
  markSynced("x");
  expect(readDraft("x")?.pending).toBe(false);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  expect(() => writeDraft("y", 1, true)).not.toThrow();
});
