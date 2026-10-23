import sharp from "sharp";

import { PORTAL } from "./api";

/**
 * Build-time resizing of the images the college chose (design review B6): the site shows a
 * picture that is as small as the screen needs, in AVIF or WebP, instead of the original upload
 * (a 132 KB JPEG and an 843×927 logo were most of the home page's image weight).
 */
export const HERO_WIDTHS = [480, 960, 1440] as const;
export type Format = "avif" | "webp";

const sources = new Map<string, Promise<Uint8Array | null>>();

/** The uploaded file, once per build; null when it cannot be fetched (the original is then used). */
function source(url: string): Promise<Uint8Array | null> {
  if (!sources.has(url)) {
    sources.set(
      url,
      fetch(new URL(url, PORTAL))
        .then(async (response) =>
          response.ok ? new Uint8Array(await response.arrayBuffer()) : null,
        )
        .catch(() => null),
    );
  }
  return sources.get(url)!;
}

/** `url` resized to at most `width` pixels wide, never enlarged. */
export async function resized(
  url: string,
  width: number,
  format: Format,
): Promise<Uint8Array | null> {
  const bytes = await source(url);
  if (!bytes) return null;
  const pipeline = sharp(bytes).rotate().resize({ width, withoutEnlargement: true });
  const out =
    format === "avif"
      ? await pipeline.avif({ quality: 50, effort: 4 }).toBuffer()
      : await pipeline.webp({ quality: 74 }).toBuffer();
  return new Uint8Array(out);
}

export const imageResponse = (bytes: Uint8Array, format: Format) =>
  new Response(bytes, { headers: { "Content-Type": `image/${format}` } });
