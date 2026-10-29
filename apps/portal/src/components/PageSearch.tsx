import { Search } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";

import type { NavItem } from "./AppShell";

/** Letters an Arabic search should not tell apart: hamza forms, tāʾ marbūṭa, alif maqṣūra, harakāt. */
export const fold = (text: string) =>
  text
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();

/**
 * «ابحث عن صفحة»: the top bar's search over the pages the person can open (their navigation,
 * so it never offers a page their role does not have). Arrow keys move, Enter opens, Esc closes.
 */
export function PageSearch({ nav }: { nav: NavItem[] }) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const term = fold(query.trim());
  const seen = new Set<string>();
  const matches = term
    ? nav.filter((item) => {
        if (item.external || seen.has(item.to)) return false;
        const hit = fold(item.label).includes(term) || fold(item.group ?? "").includes(term);
        if (hit) seen.add(item.to);
        return hit;
      })
    : [];
  const shown = matches.slice(0, 8);
  const go = (item: NavItem) => {
    setQuery("");
    setOpen(false);
    navigate(item.to);
  };
  return (
    <div className="relative w-full max-w-sm">
      <Search
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="search"
        role="combobox"
        aria-label="ابحث عن صفحة"
        aria-expanded={open && !!term}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        placeholder="ابحث عن صفحة"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && shown.length) {
            event.preventDefault();
            setActive((i) => (i + 1) % shown.length);
          } else if (event.key === "ArrowUp" && shown.length) {
            event.preventDefault();
            setActive((i) => (i - 1 + shown.length) % shown.length);
          } else if (event.key === "Enter" && shown[active]) {
            event.preventDefault();
            go(shown[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-lg border border-border-soft bg-surface-alt pe-3 ps-10 text-sm text-text placeholder:text-text-muted focus:border-primary focus:bg-surface focus:outline-none"
      />
      {open && term && (
        <ul
          id={listId}
          role="listbox"
          aria-label="الصفحات"
          className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border-soft bg-surface py-1 shadow-md"
        >
          {shown.map((item, i) => {
            const Icon = item.icon;
            return (
              <li
                key={item.to}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keeps the focus in the field so the blur does not close the list first.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex min-h-10 cursor-pointer items-center gap-3 px-3 text-sm ${
                  i === active ? "bg-surface-alt text-text" : "text-text-muted"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.group && <span className="text-xs text-text-muted">{item.group}</span>}
              </li>
            );
          })}
          {!shown.length && (
            <li className="px-3 py-2 text-sm text-text-muted">لا صفحة بهذا الاسم.</li>
          )}
        </ul>
      )}
    </div>
  );
}
