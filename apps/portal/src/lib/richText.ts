/**
 * The news and event editors edit plain text; the server stores sanitized HTML paragraphs.
 * Converting both ways keeps paragraphs and line breaks and decodes entities once, so an
 * edit never turns «R&D» into «R&amp;amp;D» or joins paragraphs (review 2026-09-29, P11).
 */
const escape = (text: string) =>
  text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

/** Stored HTML → the text shown in the editor (paragraphs separated by a blank line). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = [...doc.body.querySelectorAll("p, li, h1, h2, h3, h4, blockquote")];
  const read = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    return (copy.textContent ?? "").trim();
  };
  const parts = blocks.length
    ? blocks.filter((el) => !el.parentElement?.closest("p, li")).map(read)
    : [read(doc.body)];
  return parts.filter(Boolean).join("\n\n");
}

/** Editor text → HTML paragraphs; a single line break stays a <br>. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
