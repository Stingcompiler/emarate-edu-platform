import { createApiClient } from "@ecst/api";

/** One client for the whole portal. Same origin: the Vite proxy (dev) or the
 *  production reverse proxy forwards /api to Django. */
export const api = createApiClient();
