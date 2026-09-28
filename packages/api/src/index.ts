import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./generated/schema";

export type { components, paths };
export type Health = components["schemas"]["Health"];
export type Schemas = components["schemas"];
/** RFC 9457 error body returned by every endpoint on failure (docs/05 §7). */
export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  errors?: Record<string, string[]>;
};

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

/** Django's CSRF protection: echo the csrftoken cookie on unsafe requests. */
const csrf: Middleware = {
  onRequest({ request }) {
    if (UNSAFE_METHODS.has(request.method)) {
      const token = readCookie("csrftoken");
      if (token) request.headers.set("X-CSRFToken", token);
    }
    return request;
  },
};

const REFRESH_PATH = "/api/v1/auth/refresh";
let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit a 401 meanwhile. */
function refreshSession(baseUrl: string): Promise<boolean> {
  refreshing ??= fetch(`${baseUrl}${REFRESH_PATH}`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRFToken": readCookie("csrftoken") ?? "" },
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Silent refresh (docs/05 §8.2): the access cookie lives 15 minutes. On a 401
 * the client rotates the refresh cookie once and replays the request.
 */
function sessionRefresh(baseUrl: string): Middleware {
  const pending = new Map<string, Request>();
  return {
    onRequest({ request, id }) {
      if (!request.url.includes("/api/v1/auth/")) pending.set(id, request.clone());
      return request;
    },
    async onResponse({ response, id }) {
      const original = pending.get(id);
      pending.delete(id);
      if (response.status !== 401 || !original) return response;
      if (!(await refreshSession(baseUrl))) return response;
      const retry = new Request(original);
      const token = readCookie("csrftoken");
      if (token && UNSAFE_METHODS.has(retry.method)) retry.headers.set("X-CSRFToken", token);
      return fetch(retry);
    },
    onError({ id }) {
      pending.delete(id);
    },
  };
}

/** `language` picks the API's message language (docs/05 §7); the portal is Arabic-only, so a
 *  browser set to English still gets Arabic errors. */
export function createApiClient(baseUrl = "", language = "ar") {
  const client = createClient<paths>({
    baseUrl,
    credentials: "include",
    headers: { "Accept-Language": language },
  });
  client.use(csrf);
  client.use(sessionRefresh(baseUrl));
  return client;
}

/** The problem+json body of a failed call, or a generic one for network errors. */
export function asProblem(error: unknown, status = 0): Problem {
  if (error && typeof error === "object" && "code" in error) return error as Problem;
  return {
    type: "about:blank",
    title: "Error",
    status,
    detail: "تعذّر الاتصال بالخادم. تحقّق من الاتصال وأعد المحاولة.",
    code: "network",
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
