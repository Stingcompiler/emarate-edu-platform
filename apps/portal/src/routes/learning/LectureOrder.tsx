import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";

import { useToast } from "../../components/Toast";
import { Button, Card, Notice, problemMessage } from "../../components/ui";
import { api } from "../../lib/api";

type Row = { public_id: string; title_ar: string; is_published: boolean };

/**
 * «ترتيب المحاضرات» (docs/07 §teacher lectures: «قائمة قابلة للترتيب (سحب)»). The syllabus order,
 * first lecture on top: drag a row by its handle (mouse or touch), or move it with the arrows
 * (keyboard). Nothing is sent until «حفظ الترتيب»; the server renumbers 1…n in one audited step.
 */
export function LectureOrder({
  offering,
  lectures,
  onDone,
}: {
  offering: number;
  lectures: Row[];
  onDone: () => void;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState(lectures);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const changed = rows.some((r, i) => r.public_id !== lectures[i]?.public_id);
  const save = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/api/v1/lectures/reorder", {
        body: { offering, lectures: rows.map((r) => r.public_id) },
      });
      if (!response.ok) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["lectures"] });
      toast("حُفظ ترتيب المحاضرات");
      onDone();
    },
  });
  const move = (from: number, to: number) =>
    setRows((rs) => {
      if (to < 0 || to >= rs.length || from === to) return rs;
      const next = [...rs];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x!);
      return next;
    });
  // Pointer drag: the row under the pointer's height takes the dragged row's place.
  const onDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(id);
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging || !list.current) return;
    const items = [...list.current.children] as HTMLElement[];
    const over = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY < r.bottom;
    });
    const from = rows.findIndex((r) => r.public_id === dragging);
    if (over >= 0) move(from, over);
  };
  const onUp = () => setDragging(null);

  return (
    <Card className="p-2">
      <p className="px-2 pb-2 pt-1 text-xs text-text-muted">
        اسحب المحاضرة من المقبض أو حرّكها بالسهمين؛ الأولى في الأعلى.
      </p>
      <ol ref={list} className="space-y-1" aria-label="ترتيب المحاضرات">
        {rows.map((r, i) => (
          <li
            key={r.public_id}
            className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${
              dragging === r.public_id
                ? "border-primary bg-primary-soft shadow-md"
                : "border-border-soft bg-surface"
            }`}
          >
            <button
              type="button"
              aria-label={`اسحب «${r.title_ar}»`}
              className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-text-muted hover:bg-surface-alt active:cursor-grabbing"
              onPointerDown={(e) => onDown(e, r.public_id)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <GripVertical size={18} aria-hidden />
            </button>
            <span className="w-7 text-center font-mono text-sm text-text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
              {r.title_ar}
              {!r.is_published && <span className="font-normal text-text-muted"> · مسودة</span>}
            </span>
            <button
              type="button"
              aria-label={`«${r.title_ar}» أعلى`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
              className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-alt disabled:opacity-30"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`«${r.title_ar}» أسفل`}
              disabled={i === rows.length - 1}
              onClick={() => move(i, i + 1)}
              className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-alt disabled:opacity-30"
            >
              <ArrowDown size={16} aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {save.isError && (
        <div className="mt-2">
          <Notice>{problemMessage(save.error)}</Notice>
        </div>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2 p-1">
        <Button variant="secondary" className="min-h-10 px-4" onClick={onDone}>
          إلغاء
        </Button>
        <Button
          className="min-h-10 px-4"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "جارٍ الحفظ…" : "حفظ الترتيب"}
        </Button>
      </div>
    </Card>
  );
}
