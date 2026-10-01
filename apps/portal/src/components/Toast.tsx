import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Say = (message: string) => void;

const ToastContext = createContext<Say>(() => {});

/**
 * «حُفظ ✓» after an action (review 2026-09-29 §2.6): a short note that rises above the phone's
 * tab bar, its check drawing itself, and leaves after a moment. Announced politely to screen
 * readers; «reduce motion» keeps the note and drops the movement. A page's pinned action bar
 * (`data-dock`, e.g. the page editor's save buttons) stays uncovered: the note rises above it.
 * `const done = useToast(); … onSuccess: () => done("سُلِّم الواجب")`.
 */
export function useToast(): Say {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = useCallback<Say>((message) => {
    clearTimeout(timer.current);
    setNote({ id: Date.now(), message });
    timer.current = setTimeout(() => setNote(null), 2600);
  }, []);
  const box = useRef<HTMLDivElement>(null);
  // Followed every frame while the note shows: a bar may leave with the save a tick later
  // (the settings «unsaved changes» bar) or arrive with the next item (grading).
  useLayoutEffect(() => {
    if (!note) return;
    let frame = 0;
    const place = () => {
      const tops = [...document.querySelectorAll<HTMLElement>("[data-dock]")]
        .filter((e) => ["sticky", "fixed"].includes(getComputedStyle(e).position))
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.top < innerHeight && r.bottom > innerHeight - 200)
        .map((r) => r.top);
      if (box.current)
        box.current.style.bottom = tops.length ? `${innerHeight - Math.min(...tops) + 8}px` : "";
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [note]);
  return (
    <ToastContext.Provider value={say}>
      {children}
      <div
        ref={box}
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 transition-[bottom] duration-200 motion-reduce:transition-none lg:bottom-6"
      >
        {note && (
          <span
            key={note.id}
            className="motion-sheet flex items-center gap-2 rounded-full bg-text px-4 py-2.5 text-sm font-semibold text-bg shadow-lg"
          >
            <span className="motion-check grid size-5 place-items-center rounded-full bg-success text-white">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5l4.2 4.2L19 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ ["--len" as string]: 22 }}
                />
              </svg>
            </span>
            {note.message}
          </span>
        )}
      </div>
    </ToastContext.Provider>
  );
}
