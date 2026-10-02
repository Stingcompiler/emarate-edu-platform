/**
 * Whether the large-screen layout (Tailwind `lg`, ≥ 1024px) is showing. Read once per render:
 * enough for defaults such as which row a side panel shows before anything is picked.
 */
export function isWide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(min-width: 1024px)").matches
    : false;
}
