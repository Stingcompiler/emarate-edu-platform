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

/** Like ok(), for something that may simply not exist yet (no submission so far): a 404 is
 *  `null`, not an error — so the page shows its empty state, not «لم نجد بعض ما تطلبه». */
export function okOrNone<T>(result: { data?: T; error?: unknown; response: Response }): T | null {
  return result.response.status === 404 ? null : ok(result);
}

/**
 * Open a link fetched after a click (a signed file URL, a meeting link). The tab opens during
 * the click — browsers, iOS in particular, block tabs opened after an `await` — and is sent to
 * the link once it arrives (review 2026-09-29, P13). No link: the tab closes.
 */
export async function openAfter(getUrl: () => Promise<string | null | undefined>) {
  const tab = window.open("about:blank", "_blank");
  try {
    const url = await getUrl();
    if (!url) tab?.close();
    else if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else window.location.href = url; // pop-ups blocked outright: open it here
  } catch (error) {
    tab?.close();
    throw error;
  }
}
