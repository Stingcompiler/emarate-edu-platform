import { useSyncExternalStore } from "react";

/** Whether the device says it is connected (`navigator.onLine` and its two events). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** A failed request that never reached the server (no answer, as opposed to a refusal). */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError || // fetch rejects with TypeError when the network is down
    (error instanceof DOMException && error.name === "NetworkError") ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  );
}
