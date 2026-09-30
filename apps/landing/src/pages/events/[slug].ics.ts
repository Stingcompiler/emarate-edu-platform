import type { APIRoute } from "astro";

import { type Event, events, get, pastEvents, site } from "../../lib/api";

/**
 * «أضف إلى التقويم» (W11): one iCalendar file per event, built with the site — works in
 * Google, Apple and Outlook calendars without any account or tracking.
 */
export async function getStaticPaths() {
  const items = [...(await events()), ...(await pastEvents())];
  const full = await Promise.all(
    items.map((e) => get<Event | null>(`events/${encodeURIComponent(e.slug)}`, null)),
  );
  return full
    .filter((e): e is Event => !!e)
    .map((e) => ({ params: { slug: e.slug }, props: { e } }));
}

const stamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const text = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\;,]/g, (c) => `\\${c}`);
// Lines longer than 75 octets are folded (RFC 5545 §3.1), without splitting a character.
const fold = (line: string) => {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
};

export const GET: APIRoute = async ({ props, site: base }) => {
  const e = (props as { e: Event }).e;
  const s = await site();
  const url = new URL(`/ar/events/${e.slug}/`, base).toString();
  const where = [e.location, s.address].filter(Boolean).join("، ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ECST//Public site//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.slug}@${new URL(base ?? "https://example.invalid").host}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.starts_at)}`,
    `DTEND:${stamp(e.ends_at)}`,
    `SUMMARY:${text(e.title)}`,
    ...(where ? [`LOCATION:${text(where)}`] : []),
    ...(e.description ? [`DESCRIPTION:${text(e.description).slice(0, 600)}`] : []),
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
};
