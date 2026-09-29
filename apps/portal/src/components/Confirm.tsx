import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "./ui";

type Options = {
  title: string;
  body?: ReactNode;
  /** The action's own verb («حذف», «إلغاء النشر») — never a bare «نعم». */
  confirm: string;
  cancel?: string;
  tone?: "danger" | "primary";
};
type Ask = (options: Options) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(async () => false);

/**
 * Ask before an action that deletes, cancels or can't be undone (review 2026-09-29, P9):
 * `if (await confirm({ title, body, confirm: "حذف", tone: "danger" })) …`. A bottom sheet on
 * phones, a dialog on large screens; «إلغاء» has the focus, Esc and the backdrop cancel.
 */
export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(Options & { resolve: (v: boolean) => void }) | null>(
    null,
  );
  const returnTo = useRef<HTMLElement | null>(null);
  const ask = useCallback<Ask>(
    (options) =>
      new Promise<boolean>((resolve) => {
        returnTo.current = document.activeElement as HTMLElement | null;
        setRequest({ ...options, resolve });
      }),
    [],
  );
  const close = useCallback(
    (answer: boolean) => {
      request?.resolve(answer);
      setRequest(null);
      returnTo.current?.focus?.();
    },
    [request],
  );
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && <ConfirmDialog {...request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  title,
  body,
  confirm,
  cancel = "إلغاء",
  tone = "danger",
  onClose,
}: Options & { onClose: (answer: boolean) => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(false);
      if (event.key !== "Tab" || !panel.current) return;
      // Keep the focus inside the dialog.
      const buttons = panel.current.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      <div
        aria-hidden="true"
        className="motion-backdrop absolute inset-0 bg-black/40"
        onClick={() => onClose(false)}
      />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={body ? "confirm-body" : undefined}
        className="motion-sheet relative w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl lg:rounded-2xl lg:pb-5"
      >
        <h2 id="confirm-title" className="text-base font-bold text-text">
          {title}
        </h2>
        {body && (
          <div id="confirm-body" className="mt-2 text-sm leading-6 text-text-muted">
            {body}
          </div>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelButton}
            variant="secondary"
            className="min-h-11 px-5"
            onClick={() => onClose(false)}
          >
            {cancel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            className="min-h-11 px-5"
            onClick={() => onClose(true)}
          >
            {confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}
