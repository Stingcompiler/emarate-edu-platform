/** Letters an Arabic search should not tell apart: hamza forms, tāʾ marbūṭa, alif maqṣūra, harakāt
 * (and Latin case, for university numbers and course codes). */
export const fold = (text: string) =>
  text
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();

/** Whether any of `texts` holds what was typed, read the way `fold` reads it; an empty search
 * matches everything. The search boxes inside a page use it (review 2026-11-10, R88: «احمد» did
 * not find «أحمد» and «26-it» did not find «26-IT» on the promotion page). */
export function matches(typed: string, ...texts: (string | null | undefined)[]) {
  const needle = fold(typed.trim());
  return !needle || texts.some((text) => !!text && fold(text).includes(needle));
}
