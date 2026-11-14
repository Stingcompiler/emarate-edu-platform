import { type FormEvent, type ReactNode, useId, useRef } from "react";

import { Button } from "./ui";
import { useDialogFocus } from "./useDialogFocus";

/**
 * A short form asked over the page: a bottom sheet on phones, a dialog on large screens
 * (docs/06 §9). The focus moves in, Tab stays inside, Esc and the backdrop cancel, and the
 * focus returns on close (useDialogFocus). For a yes/no question use `useConfirm` instead.
 */
export function FormDialog({
  title,
  children,
  submit,
  tone = "primary",
  busy = false,
  onSubmit,
  onClose,
}: {
  title: string;
  children: ReactNode;
  /** The action's own verb («تنزيل الملف»), never a bare «موافق». */
  submit: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLFormElement>(null);
  const id = useId();
  useDialogFocus(true, panel, onClose);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      <div
        aria-hidden="true"
        className="motion-backdrop absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <form
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!busy) onSubmit();
        }}
        className="motion-sheet relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl lg:rounded-2xl lg:pb-5"
      >
        <h2 id={id} className="text-base font-bold text-text">
          {title}
        </h2>
        <div className="mt-3 space-y-3">{children}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="min-h-11 px-5" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            type="submit"
            variant={tone === "danger" ? "danger" : "primary"}
            className="min-h-11 px-5"
            aria-busy={busy}
          >
            {submit}
          </Button>
        </div>
      </form>
    </div>
  );
}
