import { CheckCircle2, FileUp, RotateCcw, X, XCircle } from "lucide-react";

import type { UploadProgress } from "../lib/upload";
import { fmtSize } from "../lib/learning";

export type Upload =
  | { state: "uploading"; name: string; progress: UploadProgress | null }
  | { state: "done"; name: string; message?: string }
  | { state: "error"; name: string; message: string };

/**
 * One file's upload, as file managers show it (Google Drive, Dropbox): the name, the bytes
 * sent out of the size with a bar and a percentage while it goes up; then a clear result —
 * a green tick «تم الرفع», or the reason in red with «أعد المحاولة». Announced to screen
 * readers (role=status / alert).
 */
export function UploadStatus({
  upload,
  onRetry,
  onDismiss,
}: {
  upload: Upload;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const p = upload.state === "uploading" ? upload.progress : null;
  const ratio = p && p.total ? p.loaded / p.total : 0;
  const percent = Math.round(ratio * 100);
  const tone =
    upload.state === "done"
      ? "border-success/40 bg-success-soft"
      : upload.state === "error"
        ? "border-danger/40 bg-danger-soft"
        : "border-border-soft bg-surface";
  return (
    <div
      role={upload.state === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${tone}`}
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0">
          {upload.state === "done" ? (
            <CheckCircle2 size={22} aria-hidden className="text-success-strong" />
          ) : upload.state === "error" ? (
            <XCircle size={22} aria-hidden className="text-danger-strong" />
          ) : (
            <FileUp size={22} aria-hidden className="text-primary" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-text">{upload.name}</span>
          <span
            className={`block text-xs ${
              upload.state === "error"
                ? "text-danger-strong"
                : upload.state === "done"
                  ? "text-success-strong"
                  : "text-text-muted"
            }`}
          >
            {upload.state === "uploading"
              ? p
                ? `يُرفع · ${fmtSize(p.loaded)} من ${fmtSize(p.total)}`
                : "يبدأ الرفع…"
              : upload.state === "done"
                ? (upload.message ?? "تم الرفع بنجاح")
                : upload.message}
          </span>
        </span>
        {upload.state === "uploading" && (
          <b className="shrink-0 tabular-nums text-text">
            <bdi>{percent}٪</bdi>
          </b>
        )}
        {upload.state === "error" && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="tap-44 inline-flex shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-primary hover:bg-surface-alt"
          >
            <RotateCcw size={16} aria-hidden />
            أعد المحاولة
          </button>
        )}
        {upload.state !== "uploading" && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="إخفاء"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-surface-alt"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
      {upload.state === "uploading" && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt"
          role="progressbar"
          aria-label={`رفع ${upload.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
