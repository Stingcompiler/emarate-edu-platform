import { createApiClient } from "@ecst/api";

/** One client for the whole portal. Same origin: the Vite proxy (dev) or the
 *  production reverse proxy forwards /api to Django. */
export const api = createApiClient();

/** A failed API call, with its HTTP status (404 = not found, 403 = not allowed…). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

/**
 * The data of a successful call. A failed one throws, so a query reports `isError` (and the
 * error banner explains it) instead of looking like an empty list (review 2026-09-29, P1).
 */
export function ok<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T;
  throw new ApiError(result.response.status, result.error);
}
