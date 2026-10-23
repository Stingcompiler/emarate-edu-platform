import type { APIRoute } from "astro";

import { site } from "../lib/api";
import { imageResponse, resized } from "../lib/images";

// The logo at the size the header and footer show it (twice 40 px, for sharp screens): the
// upload may be 843×927 and tens of KB (design review B6). Linked only when a logo is set.
export const GET: APIRoute = async () => {
  const url = (await site()).logo_url;
  const bytes = url ? await resized(url, 96, "webp") : null;
  return bytes ? imageResponse(bytes, "webp") : new Response(null, { status: 404 });
};
