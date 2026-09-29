import { Link } from "react-router";

/**
 * «بث مباشر الآن» — one look everywhere (board: navy with a red dot; review 2026-09-29).
 * The dot pulses gently; reduced motion stills it (motion.css).
 */
export function LiveBanner({
  title,
  meta,
  to = "/live",
}: {
  title: string;
  meta?: string;
  to?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl bg-header p-4 text-white shadow-sm hover:opacity-95"
    >
      <span className="relative grid size-3 shrink-0 place-items-center" aria-hidden>
        <span className="absolute size-3 animate-ping rounded-full bg-danger opacity-60" />
        <span className="relative size-2.5 rounded-full bg-danger" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-xs text-navy-100">بث مباشر الآن</b>
        <span className="block truncate font-semibold">{title}</span>
        {meta && <span className="block truncate text-xs text-navy-100">{meta}</span>}
      </span>
      <span className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-bold text-navy-700">
        انضمام
      </span>
    </Link>
  );
}
