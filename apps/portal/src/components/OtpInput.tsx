import { type InputHTMLAttributes, useId, useState } from "react";

/**
 * A one-time code as separate boxes (owner, 2026-10-02), one per digit, read left to right as
 * codes are. One real input sits over the boxes, transparent: it keeps what split fields lose —
 * the phone's code autofill (one-time-code), pasting the whole code, and a single field for
 * screen readers — while the boxes show the digits and where the next one goes.
 */
export function OtpInput({
  label,
  value,
  onChange,
  length = 6,
  hint,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "maxLength"> & {
  label: string;
  value: string;
  onChange: (code: string) => void;
  length?: number;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const hintId = useId();
  const active = Math.min(value.length, length - 1);
  return (
    <div className="border-b border-border-soft px-4 py-3 last:border-b-0">
      <span className="block text-xs text-text-muted">{label}</span>
      <div dir="ltr" className="relative mx-auto mt-2 flex max-w-sm gap-2">
        {Array.from({ length }, (_, i) => {
          const digit = value[i];
          const current = focused && i === active && value.length < length;
          return (
            <span
              key={i}
              aria-hidden="true"
              className={`grid aspect-square max-w-14 flex-1 place-items-center rounded-xl border-2 bg-surface text-2xl font-semibold text-text transition-colors ${
                current || (focused && value.length === length && i === length - 1)
                  ? "border-primary"
                  : digit
                    ? "border-border"
                    : "border-border-soft"
              }`}
            >
              {digit ?? (current && <span className="otp-caret h-7 w-0.5 rounded bg-primary" />)}
            </span>
          );
        })}
        <input
          {...props}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          value={value}
          // No maxLength: the browser would cut a pasted «98 76 54» before the spaces go.
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
          onFocus={(e) => {
            setFocused(true);
            // The caret always sits after the last digit, like the boxes show.
            const end = e.target.value.length;
            e.target.setSelectionRange(end, end);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
        />
      </div>
      {hint && (
        <span id={hintId} className="mt-2 block text-center text-xs text-text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}
