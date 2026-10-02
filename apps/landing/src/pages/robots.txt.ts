import type { APIRoute } from "astro";

// SITE_NOINDEX=1 (a demo or test copy, full of sample content): search engines stay out.
const hidden = import.meta.env.SITE_NOINDEX === "1";

export const GET: APIRoute = ({ site }) =>
  new Response(
    hidden
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", site)}\n`,
    { headers: { "Content-Type": "text/plain" } },
  );
