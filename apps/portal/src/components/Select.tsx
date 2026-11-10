import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  Children,
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { fold } from "../lib/search";
import { useDialogFocus } from "./useDialogFocus";

/**
 * The portal's one pick-one control (owner, 2026-11-07: «modernize the dropdowns, system-wide»).
 *
 * - ``Select``: a drop-in for ``<select>`` — same ``<option>``/``<optgroup>`` children, ``value``
 *   or ``defaultValue``, ``name``, ``required``, ``disabled``, and ``onChange(e)`` with
 *   ``e.target.value``. The trigger keeps the caller's box classes.
 * - ``ChoiceField``: the same picker as a row of a form card (label inside), from a list of
 *   ``Choice`` with a second line, a group and a chip per option.
 *
 * Both open a bottom sheet on phones and a menu anchored to the trigger on large screens. Long
 * lists get a search that ignores Arabic spelling variants. Arrows move, Enter picks, Esc
 * closes and gives the focus back; a letter jumps to the next option starting with it.
 */

export type Choice = {
  value: string;
  label: string;
  /** A second line under the label (e.g. the English name). */
  hint?: string;
  /** Options with the same group are listed together under it, in the given order. */
  group?: string;
  /** A short chip beside the label (e.g. the degree). */
  badge?: string;
  disabled?: boolean;
};

/** Lists longer than this get a search box. */
const SEARCH_FROM = 9;

// ─── Reading <option>/<optgroup> children ────────────────────────────────

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };
type GroupProps = { label?: string; children?: ReactNode };

export function choicesFrom(children: ReactNode, group?: string): Choice[] {
  const out: Choice[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<OptionProps & GroupProps>;
    if (element.type === Fragment) {
      out.push(...choicesFrom(element.props.children, group));
    } else if (element.type === "optgroup") {
      out.push(...choicesFrom(element.props.children, element.props.label));
    } else if (element.type === "option") {
      const label = textOf(element.props.children).replace(/\s+/g, " ").trim();
      out.push({
        value: String(element.props.value ?? label),
        label,
        group,
        disabled: !!element.props.disabled,
      });
    }
  });
  return out;
}

// ─── Select: the drop-in for <select> ────────────────────────────────────

export type SelectChange = { target: { value: string }; currentTarget: { value: string } };

export function Select({
  value,
  defaultValue,
  onChange,
  children,
  className = "",
  id,
  name,
  required,
  disabled,
  autoFocus,
  title,
  searchPlaceholder = "ابحث",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}: {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (event: SelectChange) => void;
  children: ReactNode;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
  searchPlaceholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}) {
  const listId = useId();
  const options = useMemo(() => choicesFrom(children), [children]);
  const [own, setOwn] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const current = value === undefined ? own : String(value ?? "");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // Like a native select: an unknown value shows the first option.
  const shown = options.find((o) => o.value === current) ?? options[0];
  const box = className.replace(/(^|\s)(block|inline-block)(?=\s|$)/g, " ");
  const display = /(^|\s)(block|w-full)(\s|$)/.test(className) ? "flex" : "inline-flex";

  const pick = (next: string) => {
    if (value === undefined) setOwn(next);
    if (next !== current) onChange?.({ target: { value: next }, currentTarget: { value: next } });
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        autoFocus={autoFocus}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired ?? required}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`${display} min-w-0 max-w-full cursor-pointer items-center gap-2 text-start disabled:cursor-not-allowed disabled:opacity-60 ${box}`}
      >
        <span className="min-w-0 flex-1 truncate">{shown?.label ?? ""}</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="shrink-0 opacity-60" />
      </button>
      <HiddenValue
        name={name}
        value={current}
        required={required}
        onInvalid={() => {
          trigger.current?.focus();
          setOpen(true);
        }}
      />
      {open && (
        <ChoicePopup
          listId={listId}
          anchor={trigger}
          title={ariaLabel ?? labelOf(trigger.current)}
          options={options}
          value={current}
          searchPlaceholder={searchPlaceholder}
          empty="لا نتائج"
          onPick={(next) => {
            pick(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The visible label of a trigger: its aria-labelledby target or its <label>, minus the trigger. */
function labelOf(element: HTMLElement | null): string {
  if (!element) return "";
  const by = element.getAttribute("aria-labelledby");
  if (by) {
    return by
      .split(/\s+/)
      .filter((part) => part !== element.id)
      .map((part) => document.getElementById(part)?.textContent ?? "")
      .join(" ")
      .trim();
  }
  const label = (element as HTMLButtonElement).labels?.[0];
  if (!label) return "";
  const copy = label.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("button, input, select, textarea").forEach((n) => n.remove());
  return (copy.textContent ?? "").replace("*", "").trim();
}

/** Carries the value into a form (``name``) and its validation (``required``). */
function HiddenValue({
  name,
  value,
  required,
  onInvalid,
}: {
  name?: string;
  value: string;
  required?: boolean;
  onInvalid: () => void;
}) {
  if (!name && !required) return null;
  return (
    <input
      tabIndex={-1}
      aria-hidden
      name={name}
      required={required}
      value={value}
      onChange={() => undefined}
      onInvalid={(event) => {
        event.preventDefault();
        onInvalid();
      }}
      className="pointer-events-none absolute size-px opacity-0"
    />
  );
}

// ─── ChoiceField: the same picker as a form-card row ─────────────────────

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
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-labelledby={`${id}-label`}
        aria-required={required}
        autoFocus={autoFocus}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
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
      <HiddenValue
        value={value}
        required={required}
        onInvalid={() => {
          trigger.current?.focus();
          setOpen(true);
        }}
      />
      {open && (
        <ChoicePopup
          listId={`${id}-list`}
          anchor={trigger}
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

// ─── The popup: a sheet on phones, an anchored menu on large screens ─────

const WIDE = "(min-width: 1024px)";

function ChoicePopup({
  listId,
  anchor,
  title,
  options,
  value,
  searchPlaceholder,
  empty,
  onPick,
  onClose,
}: {
  listId: string;
  anchor: RefObject<HTMLElement | null>;
  title: string;
  options: Choice[];
  value: string;
  searchPlaceholder: string;
  empty: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  // A stable close: the focus trap and the menu's listeners must not restart on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current(), []);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [wide] = useState(() => window.matchMedia?.(WIDE).matches ?? false);
  const [query, setQuery] = useState("");
  const searchable = options.length >= SEARCH_FROM;
  useDialogFocus(true, panel, close, searchable ? search : list);

  // The sheet stops the page behind from scrolling; the menu follows its trigger instead.
  useEffect(() => {
    if (wide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [wide]);
  const place = useAnchoredPlace(wide, anchor, panel, close);

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
  const enabled = (i: number) => !!flat[i] && !flat[i]!.disabled;
  const [active, setActive] = useState(() => {
    const at = flat.findIndex((o) => o.value === value);
    return at >= 0
      ? at
      : Math.max(
          0,
          flat.findIndex((o) => !o.disabled),
        );
  });
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView.
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  const move = (from: number, step: number) => {
    for (let k = 1; k <= flat.length; k++) {
      const next = (from + step * k + flat.length * k) % flat.length;
      if (enabled(next)) return setActive(next);
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (!flat.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(current, event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" && !searchable) {
      event.preventDefault();
      move(-1, 1);
    } else if (event.key === "End" && !searchable) {
      event.preventDefault();
      move(flat.length, -1);
    } else if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      if (enabled(current)) onPick(flat[current]!.value);
    } else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // Type-ahead: the next option whose label starts with the letter.
      const letter = fold(event.key);
      for (let k = 1; k <= flat.length; k++) {
        const i = (current + k) % flat.length;
        if (enabled(i) && fold(flat[i]!.label).startsWith(letter)) return setActive(i);
      }
    }
  };

  const activeId = flat[current] ? `${id}-o${current}` : undefined;
  const body = (
    <>
      {searchable && (
        <div className={wide ? "p-2 pb-1" : "px-5 pb-3"}>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-alt px-3 focus-within:border-primary lg:min-h-10">
            <Search size={18} strokeWidth={1.75} aria-hidden className="text-text-muted" />
            <input
              ref={search}
              type="search"
              role="combobox"
              aria-label={searchPlaceholder}
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted lg:text-sm"
            />
          </label>
        </div>
      )}
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-label={title || undefined}
        tabIndex={searchable ? -1 : 0}
        aria-activedescendant={searchable ? undefined : activeId}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none ${
          wide ? "p-1.5" : "px-3 pb-4"
        }`}
      >
        {!flat.length && <p className="px-2 py-6 text-center text-sm text-text-muted">{empty}</p>}
        {groups.map(([group, items], g) => (
          <div key={group || g} role="group" aria-labelledby={group ? `${id}-g${g}` : undefined}>
            {group && (
              <div
                id={`${id}-g${g}`}
                className="sticky top-0 z-10 bg-surface px-2.5 pt-2.5 pb-1 text-xs font-semibold text-text-muted"
              >
                {group}
              </div>
            )}
            {items.map((o) => {
              const index = flat.indexOf(o);
              const selected = o.value === value;
              return (
                <div
                  key={`${o.value}-${index}`}
                  id={`${id}-o${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled || undefined}
                  onClick={() => !o.disabled && onPick(o.value)}
                  onMouseMove={() => !o.disabled && index !== current && setActive(index)}
                  className={`flex items-center gap-3 rounded-lg px-2.5 ${
                    o.hint ? "py-2" : "py-1.5"
                  } min-h-11 lg:min-h-9 ${
                    o.disabled
                      ? "cursor-not-allowed text-text-muted opacity-60"
                      : `cursor-pointer ${index === current ? "bg-primary-soft/60" : ""}`
                  } ${selected ? "font-semibold text-primary" : "text-text"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[15px] lg:text-sm">{o.label || " "}</span>
                      {o.badge && <Badge text={o.badge} />}
                    </span>
                    {o.hint && (
                      <span className="mt-0.5 block truncate text-xs font-normal text-text-muted">
                        <bdi>{o.hint}</bdi>
                      </span>
                    )}
                  </span>
                  <Check
                    size={16}
                    strokeWidth={2.5}
                    aria-hidden
                    className={`shrink-0 ${selected ? "text-primary" : "invisible"}`}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );

  if (wide) {
    return createPortal(
      <div
        className="fixed inset-0 z-[70]"
        onMouseDown={(e) => e.target === e.currentTarget && close()}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={title || undefined}
          onKeyDown={onKey}
          style={place}
          className="motion-menu fixed flex flex-col overflow-hidden rounded-xl border border-border-soft bg-surface shadow-xl"
        >
          {body}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div
        aria-hidden="true"
        className="motion-backdrop absolute inset-0 bg-black/40"
        onClick={close}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={onKey}
        className="motion-sheet relative flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl"
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center gap-2 px-5 pt-3 pb-2">
          <h2 id={`${id}-title`} className="flex-1 text-base font-bold text-text">
            {title || "اختر"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="إغلاق"
            className="grid size-11 place-items-center rounded-full text-text-muted hover:bg-surface-alt"
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Where the menu sits: under its trigger (over it when there is more room above), at least as
 * wide as the trigger, inside the window. It follows the trigger while the page scrolls and
 * closes when the window is resized.
 */
function placeUnder(anchor: HTMLElement | null): CSSProperties {
  const rect = anchor?.getBoundingClientRect();
  if (!anchor || !rect) return {};
  const gap = 6;
  const margin = 8;
  const width = Math.min(Math.max(rect.width, 240), 480, innerWidth - 2 * margin);
  const below = innerHeight - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  const up = below < 240 && above > below;
  const maxHeight = Math.min(up ? above : below, 400);
  const rtl = getComputedStyle(anchor).direction === "rtl";
  const start = rtl ? rect.right - width : rect.left;
  const left = Math.min(Math.max(start, margin), innerWidth - width - margin);
  return {
    left,
    width,
    maxHeight,
    ...(up ? { bottom: innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
  };
}

function useAnchoredPlace(
  wide: boolean,
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  // Placed on the first render, so the menu is visible (and focusable) when the focus moves in.
  const [place, setPlace] = useState<CSSProperties>(() => (wide ? placeUnder(anchor.current) : {}));
  useEffect(() => {
    if (!wide) return;
    const onScroll = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      setPlace(placeUnder(anchor.current));
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [wide, anchor, panel, onClose]);
  return place;
}
