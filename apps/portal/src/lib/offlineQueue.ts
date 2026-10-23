import { useCallback, useEffect, useRef, useState } from "react";

import { isNetworkError, useOnline } from "./online";

/**
 * Things the person has written that must reach the server (a message, an internal note), kept on
 * this device until it does: sent at once when online, kept and retried when the connection is
 * down, shown as «بانتظار الإرسال» (design review B1). It generalises what an exam attempt does
 * for its answers (`TakeExam`): a queue, retried on «online» and by hand. A refusal from the
 * server (not a network failure) is not retried: it is returned to the caller to show.
 */
export type Queued<T> = { id: string; item: T; at: number };

type Options<T> = {
  /** localStorage key of this queue, e.g. `queue:reply:<application>` */
  storageKey: string;
  /** Sends one item; throws on failure. */
  send: (item: T) => Promise<void>;
};

function load<T>(storageKey: string): Queued<T>[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Queued<T>[]) : [];
  } catch {
    return [];
  }
}

function save<T>(storageKey: string, list: Queued<T>[]) {
  try {
    if (list.length) localStorage.setItem(storageKey, JSON.stringify(list));
    else localStorage.removeItem(storageKey);
  } catch {
    /* no storage: the list lives in memory only */
  }
}

export function useOfflineQueue<T>({ storageKey, send }: Options<T>) {
  const online = useOnline();
  const [pending, setPending] = useState<Queued<T>[]>(() => load<T>(storageKey));
  const sending = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [refused, setRefused] = useState<unknown>(null);

  const update = useCallback(
    (next: Queued<T>[]) => {
      setPending(next);
      save(storageKey, next);
    },
    [storageKey],
  );

  /** Sends what is waiting, oldest first; stops at the first network failure. */
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      let list = load<T>(storageKey);
      while (list.length) {
        const [head, ...rest] = list;
        try {
          await sendRef.current(head!.item);
        } catch (error) {
          if (isNetworkError(error)) break; // still offline: keep everything, try later
          setRefused(error); // the server said no: drop it, the caller shows why
        }
        list = rest;
        update(list);
      }
    } finally {
      sending.current = false;
    }
  }, [storageKey, update]);

  /** Adds an item and tries to send it now. */
  const enqueue = useCallback(
    (item: T) => {
      const entry: Queued<T> = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        item,
        at: Date.now(),
      };
      setRefused(null);
      update([...load<T>(storageKey), entry]);
      void flush();
    },
    [flush, storageKey, update],
  );

  useEffect(() => {
    if (online && pending.length) void flush();
  }, [online, pending.length, flush]);

  return { pending, enqueue, flush, online, refused };
}
