import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./generated/schema";

export type { components, paths };
export type Health = components["schemas"]["Health"];
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

export function createApiClient(baseUrl = "") {
  const client = createClient<paths>({ baseUrl, credentials: "include" });
  client.use(csrf);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
