import { Check, ChevronDown, Search, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { fold } from "./PageSearch";
import { useDialogFocus } from "./useDialogFocus";

export type Choice = {
  value: string;
  label: string;
  /** A second line under the label (e.g. the English name). */
  hint?: string;
  /** Options with the same group are listed together under it, in the given order. */
  group?: string;
  /** A short chip beside the label (e.g. the degree). */
  badge?: string;
};

/**
 * A pick-one field for long lists (owner, 2026-11-07: «modernize the dropdown»). The trigger
 * sits in a form card like ``Field``; it opens a bottom sheet on phones and a dialog on large
 * screens, with a search that ignores Arabic spelling variants, grouped options, a second line
 * per option and a check on the chosen one. Arrows move, Enter picks, Esc closes.
 *
 * ``required`` is enforced by a hidden input, so the form's own validation still stops a submit.
 */
export function ChoiceField({
  label,
  value,
  onChange,
  options,
  placeholder = "اختر",
  searchPlaceholder = "ابحث",
  empty = "لا نتائج",
  loading = false,
  required = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  loading?: boolean;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const chosen = options.find((o) => o.value === value);

  return (
    <div className="relative border-b border-border-soft last:border-b-0">
      <button
        ref={trigger}
        type="button"
        id={`${id}-trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-trigger`}
        autoFocus={autoFocus}
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-start outline-none focus-visible:bg-primary-soft/30 focus-visible:shadow-[inset_0_-2px_0_var(--focus-ring)]"
      >
        <span className="min-w-0 flex-1">
          <span id={`${id}-label`} className="block text-xs text-text-muted">
            {label}
          </span>
          <span className="mt-0.5 flex min-h-9 items-center gap-2">
            {chosen ? (
              <>
                <span className="truncate text-base text-text">{chosen.label}</span>
                {chosen.badge && <Badge text={chosen.badge} />}
              </>
            ) : (
              <span className="text-base text-text-muted">
                {loading ? "جارٍ التحميل…" : placeholder}
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          size={18}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 text-text-muted"
        />
      </button>
      {/* Constraint validation: an empty required pick stops the submit and focuses the trigger. */}
      <input
        tabIndex={-1}
        aria-hidden
        required={required}
        value={value}
        onChange={() => undefined}
        onInvalid={(event) => {
          event.preventDefault();
          trigger.current?.focus();
          setOpen(true);
        }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
      />
      {open && (
        <ChoiceSheet
          title={label}
          options={options}
          value={value}
          searchPlaceholder={searchPlaceholder}
          empty={loading && !options.length ? "جارٍ التحميل…" : empty}
          onPick={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="shrink-0 rounded-full bg-neutral-soft px-2 py-0.5 text-[11px] font-semibold text-neutral-strong">
      {text}
    </span>
  );
}

function ChoiceSheet({
  title,
  options,
  value,
  searchPlaceholder,
  empty,
  onPick,
  onClose,
}: {
  title: string;
  options: Choice[];
  value: string;
  searchPlaceholder: string;
  empty: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const searchable = options.length > 6;
  useDialogFocus(true, panel, onClose, searchable ? search : undefined);

  // The page behind does not scroll while the sheet is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const term = fold(query.trim());
  const shown = useMemo(
    () =>
      term
        ? options.filter((o) =>
            [o.label, o.hint, o.group, o.badge].some((t) => t && fold(t).includes(term)),
          )
        : options,
    [options, term],
  );
  const groups = useMemo(() => {
    const map = new Map<string, Choice[]>();
    for (const o of shown) map.set(o.group ?? "", [...(map.get(o.group ?? "") ?? []), o]);
    return [...map];
  }, [shown]);
  // Keyboard order follows the screen: group by group.
  const flat = groups.flatMap(([, items]) => items);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      flat.findIndex((o) => o.value === value),
    ),
  );
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + flat.length) % Math.max(flat.length, 1));
    } else if (event.key === "Home" && !searchable) {
      setActive(0);
    } else if (event.key === "End" && !searchable) {
      setActive(flat.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = flat[current];
      if (pick) onPick(pick.value);
    }
  };

  const listId = `${id}-list`;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      <div
        aria-hidden="true"
        className="motion-backdrop absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={onKey}
        className="motion-sheet relative flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl lg:max-h-[min(640px,85dvh)] lg:max-w-lg lg:rounded-2xl lg:pb-0"
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" />
        <div className="flex items-center gap-2 px-5 pt-3 pb-2 lg:pt-5">
          <h2 id={`${id}-title`} className="flex-1 text-base font-bold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-11 place-items-center rounded-full text-text-muted hover:bg-surface-alt"
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        {searchable && (
          <div className="px-5 pb-3">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-alt px-3 focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--focus-ring)]">
              <Search size={18} strokeWidth={1.75} aria-hidden className="text-text-muted" />
              <input
                ref={search}
                type="search"
                role="combobox"
                aria-label={searchPlaceholder}
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={flat[current] ? `${id}-o${current}` : undefined}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted"
              />
            </label>
          </div>
        )}
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label={title}
          tabIndex={searchable ? -1 : 0}
          aria-activedescendant={!searchable && flat[current] ? `${id}-o${current}` : undefined}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 outline-none"
        >
          {!flat.length && <p className="px-2 py-8 text-center text-sm text-text-muted">{empty}</p>}
          {groups.map(([group, items], g) => (
            <div key={group || g} role="group" aria-labelledby={group ? `${id}-g${g}` : undefined}>
              {group && (
                <div
                  id={`${id}-g${g}`}
                  className="sticky top-0 z-10 bg-surface px-2 pt-3 pb-1.5 text-xs font-semibold text-text-muted"
                >
                  {group}
                </div>
              )}
              {items.map((o) => {
                const index = flat.indexOf(o);
                const selected = o.value === value;
                return (
                  <div
                    key={o.value}
                    id={`${id}-o${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    onClick={() => onPick(o.value)}
                    onMouseMove={() => index !== current && setActive(index)}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${
                      index === current ? "bg-primary-soft/60" : ""
                    } ${selected ? "text-primary" : "text-text"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={`text-[15px] ${selected ? "font-semibold" : ""}`}>
                          {o.label}
                        </span>
                        {o.badge && <Badge text={o.badge} />}
                      </span>
                      {o.hint && (
                        <span className="mt-0.5 block truncate text-xs text-text-muted">
                          <bdi>{o.hint}</bdi>
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden
                      className={`grid size-6 shrink-0 place-items-center rounded-full ${
                        selected ? "bg-primary text-on-primary" : "border border-border"
                      }`}
                    >
                      {selected && <Check size={14} strokeWidth={2.5} />}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
