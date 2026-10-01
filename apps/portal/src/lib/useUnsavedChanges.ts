import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";

import { useConfirm } from "../components/Confirm";

const MESSAGE = "لديك تعديلات لم تُحفظ بعد، وستضيع إن غادرت الصفحة.";

/**
 * Guards an editor's unsaved work (review 2026-09-29, S7): leaving inside the portal asks
 * first, closing or reloading the tab warns. Put `onInput` on the editor's wrapper — any
 * typing, selecting or ticking inside marks it edited — and call `saved()` once the server
 * accepted it (before navigating away). Mark parts that save on their own with
 * `data-saves-itself`.
 */
export function useUnsavedChanges(computed?: boolean) {
  const dirtyRef = useRef(false);
  const [edited, setDirty] = useState(false);
  // A form that knows its own changes (e.g. settings compared with the server) passes them in.
  const dirty = computed ?? edited;
  dirtyRef.current = computed ?? dirtyRef.current;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  const confirm = useConfirm();
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirm({
      title: "مغادرة دون حفظ؟",
      body: MESSAGE,
      confirm: "مغادرة وتجاهل التعديلات",
      cancel: "البقاء",
    }).then((leave) => (leave ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const onInput = useCallback((event: { target: EventTarget }) => {
    const target = event.target as HTMLElement;
    // Uploads and parts that save themselves (questions, resources) aren't pending edits.
    if ((target as HTMLInputElement).type === "file" || target.closest?.("[data-saves-itself]"))
      return;
    dirtyRef.current = true;
    setDirty(true);
  }, []);
  // A change made with a button (a Segmented choice) rather than typing.
  const changed = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);
  const saved = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
  }, []);
  return { dirty, onInput, changed, saved };
}
