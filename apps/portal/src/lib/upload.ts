/** multipart/form-data through the typed client: pass FormData untouched. */
export const asForm = { bodySerializer: (body: unknown) => body as FormData };

export function formData(values: Record<string, string | Blob | null | undefined>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") form.append(key, value);
  }
  return form;
}

/** Where an upload is: the bytes sent so far out of the file's size. */
export type UploadProgress = { loaded: number; total: number };

/**
 * POST a form with progress (owner, 2026-10-30: «عداد تحميل يخبر المستخدم تقدم الرفع»). fetch
 * cannot report upload progress, so this one call goes through XMLHttpRequest, with the
 * same cookies and CSRF header as the typed client (or a visitor's Authorization header).
 * Resolves with the JSON body on 2xx; rejects with the server's problem body otherwise, or
 * a network problem when the connection drops.
 */
export function postWithProgress<T>(
  url: string,
  form: FormData,
  onProgress: (p: UploadProgress) => void,
  headers: Record<string, string> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
    if (csrf) xhr.setRequestHeader("X-CSRFToken", decodeURIComponent(csrf));
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress({ loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(body ?? { detail: `تعذّر الرفع (HTTP ${xhr.status}).` });
    };
    xhr.onerror = () =>
      reject({ detail: "انقطع الاتصال أثناء الرفع. تحقّق من الشبكة وأعد المحاولة." });
    xhr.send(form);
  });
}
