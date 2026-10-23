import { useState } from "react";

import { useOfflineQueue } from "../lib/offlineQueue";
import { Button, Notice, problemMessage } from "./ui";

/**
 * A one-line reply box whose message is kept on the device until the server has it (design
 * review B1): sent at once when online; when not, it stays listed as «بانتظار الإرسال» (dashed,
 * neutral) and goes out by itself when the connection returns. A refusal is shown, not retried.
 */
export function QueuedReply({
  storageKey,
  send,
  onSent,
  label,
  placeholder = label,
}: {
  storageKey: string;
  send: (body: string) => Promise<void>;
  onSent?: () => void;
  label: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const queue = useOfflineQueue<string>({
    storageKey,
    send: async (body) => {
      await send(body);
      onSent?.();
    },
  });
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    queue.enqueue(body);
    setText("");
  };
  return (
    <div className="mt-3">
      {queue.pending.map((entry) => (
        <p
          key={entry.id}
          className="mb-2 rounded-lg border border-dashed border-pending bg-pending-soft p-3 text-sm text-pending-strong"
        >
          «{entry.item}» · بانتظار الإرسال
        </p>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
        />
        {/* ui-allow: the send button of a one-line reply: typing enables it, a reason would break the row */}
        <Button type="submit" variant="secondary" disabled={!text.trim()}>
          إرسال
        </Button>
      </form>
      {queue.refused != null && (
        <div className="mt-2">
          <Notice>{problemMessage(queue.refused)}</Notice>
        </div>
      )}
    </div>
  );
}
