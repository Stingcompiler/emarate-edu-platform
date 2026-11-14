import { api, ApiError } from "./api";
import type { UploadProgress } from "./upload";

const TRIES = 5;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send a backup file to the server a chunk at a time (owner, 2026-11-14: the platform moves to
 * another host with a file and its password). A whole college on a weak connection: a chunk
 * that fails is sent again, a few times with a growing pause, and when the server says how
 * much it really has (409) the sending goes on from there — never from the start.
 * Resolves with the upload's id, which the restore is then asked with.
 */
export async function uploadBackup(
  file: Blob,
  onProgress: (p: UploadProgress) => void,
  pause: (ms: number) => Promise<unknown> = wait,
): Promise<string> {
  const started = await api.POST("/api/v1/backups/uploads", { body: { size: file.size } });
  if (!started.data) throw started.error ?? new ApiError(0, null);
  const { id, chunk } = started.data;
  let at = 0;
  let failures = 0;
  onProgress({ loaded: 0, total: file.size });
  while (at < file.size) {
    const piece = file.slice(at, at + chunk);
    let received: number | null = null;
    let fatal: unknown = null;
    try {
      const sent = await api.PUT("/api/v1/backups/uploads/{upload_id}", {
        params: { path: { upload_id: id }, query: { offset: at } },
        body: piece as never,
        bodySerializer: (body: unknown) => body as Blob,
        headers: { "Content-Type": "application/octet-stream" },
      });
      const answer = (sent.data ?? sent.error) as { received?: number } | undefined;
      if (sent.response.ok || sent.response.status === 409) received = answer?.received ?? null;
      // Not allowed, or the upload is gone: sending again will not help.
      else if (sent.response.status < 500) fatal = sent.error ?? new Error("upload refused");
    } catch {
      // The connection dropped: try this chunk again below.
    }
    if (fatal) throw fatal;
    if (received !== null && received !== at) {
      at = received;
      failures = 0;
      onProgress({ loaded: at, total: file.size });
      continue;
    }
    failures += 1;
    if (failures >= TRIES) throw new ApiError(0, null);
    await pause(1000 * 2 ** (failures - 1));
  }
  return id;
}
