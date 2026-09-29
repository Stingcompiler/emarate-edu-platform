import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api";

/**
 * TanStack Query holds all server state (docs/04, D-no-Zustand). Failed reads are reported
 * once, in the error banner, instead of looking like empty lists (review 2026-09-29, P1);
 * a 401 that the silent refresh couldn't fix re-checks the session, which sends the user to
 * sign in (S7).
 */
type Report = { status: number; at: number } | null;
let report: Report = null;
const listeners = new Set<() => void>();

export const queryErrors = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: () => report,
  clear() {
    report = null;
    listeners.forEach((l) => l());
  },
};

function statusOf(error: unknown): number {
  return error instanceof ApiError ? error.status : 0;
}

function onError(error: unknown, silent: boolean) {
  const status = statusOf(error);
  if (status === 401) {
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    return;
  }
  if (silent) return;
  report = { status, at: Date.now() };
  listeners.forEach((l) => l());
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => onError(error, !!query.meta?.silent),
  }),
  mutationCache: new MutationCache({
    // Mutations show their own inline errors; only an ended session matters here.
    onError: (error) => statusOf(error) === 401 && onError(error, true),
  }),
  defaultOptions: {
    queries: {
      // 4xx won't change on a retry (not allowed, not found); a server hiccup might.
      retry: (count, error) => count < 1 && !(statusOf(error) >= 400 && statusOf(error) < 500),
      // Focus refetches at most every 30 s, so switching windows doesn't re-request every page.
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  },
});

/** Refetch whatever failed (the banner's «أعد المحاولة»). */
export function retryFailed() {
  queryErrors.clear();
  void queryClient.refetchQueries({ predicate: (q) => q.state.status === "error" });
}
