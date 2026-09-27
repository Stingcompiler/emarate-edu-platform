/** multipart/form-data through the typed client: pass FormData untouched. */
export const asForm = { bodySerializer: (body: unknown) => body as FormData };

export function formData(values: Record<string, string | Blob | null | undefined>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") form.append(key, value);
  }
  return form;
}
