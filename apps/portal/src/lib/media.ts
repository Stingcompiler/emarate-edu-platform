/**
 * Whether the large-screen layout (Tailwind `lg`, ≥ 1024px) is showing. Read once per render:
 * enough for defaults such as which row a side panel shows before anything is picked.
 */
export function isWide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(min-width: 1024px)").matches
    : false;
}

/**
 * Whether an image's description (alt text) still needs writing: empty, or what an upload
 * used to leave there, a file name such as «photo_2026-10-13 17.13.54» or «IMG_0042.jpg»
 * (design review U04). Such text tells a screen reader nothing about the picture.
 */
export function altNeedsWork(alt: string | null | undefined): boolean {
  const text = (alt ?? "").trim();
  if (!text) return true;
  if (/\.(png|jpe?g|webp|gif)$/i.test(text)) return true;
  if (/^(photo|img|image|dsc|pxl|screenshot|whatsapp image)[\s_-]*\d/i.test(text)) return true;
  // Mostly digits and separators: a timestamp or a counter, not a description.
  return text.replace(/[\d\s._:-]/g, "").length < 3;
}
