import type { APIRoute, GetStaticPaths } from "astro";

import { site } from "../../lib/api";
import { HERO_WIDTHS, imageResponse, resized } from "../../lib/images";

// The home picture at each width (webp): /img/hero-480.webp, /img/hero-960.webp, /img/hero-1440.webp.
export const getStaticPaths: GetStaticPaths = async () =>
  (await site()).hero_image_url
    ? HERO_WIDTHS.map((width) => ({ params: { width: String(width) } }))
    : [];

export const GET: APIRoute = async ({ params }) => {
  const url = (await site()).hero_image_url;
  const bytes = url ? await resized(url, Number(params.width), "webp") : null;
  return bytes ? imageResponse(bytes, "webp") : new Response(null, { status: 404 });
};
