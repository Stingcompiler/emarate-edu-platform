import { readFile } from "node:fs/promises";
import path from "node:path";

import type { APIRoute } from "astro";
import sharp from "sharp";

import { PORTAL, site } from "../lib/api";

const SIZE = 192; // a multiple of 48, as search engines ask of a site icon

/**
 * The tab and home-screen icon, served from the site's own address: the logo the owner chose
 * in the site settings (it lives on the portal's domain and may be a JPEG of any shape), cut
 * to a square PNG; the built-in mark when there is no logo or it cannot be fetched.
 */
export const GET: APIRoute = async () => {
  const s = await site();
  let source: Uint8Array | undefined;
  if (s.logo_url) {
    try {
      const response = await fetch(new URL(s.logo_url, PORTAL));
      if (response.ok) source = new Uint8Array(await response.arrayBuffer());
    } catch {
      /* the built-in mark below */
    }
  }
  source ??= await readFile(path.resolve("public/favicon.svg"));
  const png = await sharp(source)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
