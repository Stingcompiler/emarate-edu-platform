/**
 * A draft kept on this device before (and until) the server has it (design review B1): a form's
 * content, written as it changes, so a lost connection, a closed tab or a reload never loses
 * what was typed. `pending` is true while the server does not have the latest. Storage can be
 * absent or full (private windows, blocked site data): every call is safe and just does nothing.
 */
export type LocalDraft<T> = { value: T; at: number; pending: boolean };

const key = (id: string) => `app:${id}`;

export function readDraft<T>(id: string): LocalDraft<T> | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as LocalDraft<T>;
    return typeof draft?.at === "number" ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(id: string, value: T, pending: boolean): void {
  try {
    localStorage.setItem(key(id), JSON.stringify({ value, at: Date.now(), pending }));
  } catch {
    /* no storage: the server copy is the only one */
  }
}

export function markSynced(id: string): void {
  const draft = readDraft<unknown>(id);
  if (draft) writeDraft(id, draft.value, false);
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(key(id));
  } catch {
    /* nothing to clear */
  }
}
