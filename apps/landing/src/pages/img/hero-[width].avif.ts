import type { APIRoute, GetStaticPaths } from "astro";

import { site } from "../../lib/api";
import { HERO_WIDTHS, imageResponse, resized } from "../../lib/images";

// The home picture at each width (avif): /img/hero-480.avif, /img/hero-960.avif, /img/hero-1440.avif.
export const getStaticPaths: GetStaticPaths = async () =>
  (await site()).hero_image_url
    ? HERO_WIDTHS.map((width) => ({ params: { width: String(width) } }))
    : [];

export const GET: APIRoute = async ({ params }) => {
  const url = (await site()).hero_image_url;
  const bytes = url ? await resized(url, Number(params.width), "avif") : null;
  return bytes ? imageResponse(bytes, "avif") : new Response(null, { status: 404 });
};
