/**
 * Minimal TUS 1.0 upload (create + chunked PATCH) for Bunny Stream, so a
 * teacher's video goes straight from the browser to the CDN (docs/05 §8.2)
 * without a third-party client. Resumes from the server offset after a
 * failed chunk; the caller can abort with an AbortSignal.
 */
const CHUNK = 8 * 1024 * 1024;

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

export async function tusUpload(
  file: File,
  ticket: { endpoint: string; headers: Record<string, string> },
  {
    title,
    onProgress,
    signal,
  }: { title: string; onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<void> {
  const base = { "Tus-Resumable": "1.0.0", ...ticket.headers };
  const created = await fetch(ticket.endpoint, {
    method: "POST",
    signal,
    headers: {
      ...base,
      "Upload-Length": String(file.size),
      "Upload-Metadata": `filetype ${b64(file.type || "video/mp4")},title ${b64(title)}`,
    },
  });
  if (created.status !== 201) throw new Error(`TUS create failed (${created.status})`);
  const location = new URL(created.headers.get("Location") ?? "", ticket.endpoint).toString();
  let offset = 0;
  let retries = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK);
    try {
      const patched = await fetch(location, {
        method: "PATCH",
        signal,
        headers: {
          ...base,
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: chunk,
      });
      if (patched.status !== 204) throw new Error(`TUS patch failed (${patched.status})`);
      offset = Number(patched.headers.get("Upload-Offset") ?? offset + chunk.size);
      retries = 0;
      onProgress?.(offset / file.size);
    } catch (error) {
      if (signal?.aborted || ++retries > 5) throw error;
      await new Promise((r) => setTimeout(r, 1000 * retries));
      const head = await fetch(location, { method: "HEAD", signal, headers: base });
      offset = Number(head.headers.get("Upload-Offset") ?? offset);
    }
  }
}
