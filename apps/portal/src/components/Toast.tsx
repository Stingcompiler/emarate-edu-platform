import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";

type Say = (message: string) => void;

const ToastContext = createContext<Say>(() => {});

/**
 * «حُفظ ✓» after an action (review 2026-09-29 §2.6): a short note that rises above the phone's
 * tab bar, its check drawing itself, and leaves after a moment. Announced politely to screen
 * readers; «reduce motion» keeps the note and drops the movement.
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
  return (
    <ToastContext.Provider value={say}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6"
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
