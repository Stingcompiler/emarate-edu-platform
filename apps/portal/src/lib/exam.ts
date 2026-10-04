/** Exam attempt helpers: typed payload, server clock, and an offline-safe answer queue. */

export type QType = "single" | "multiple" | "true_false" | "fill_blank" | "short_answer" | "essay";
export type ExamQuestion = {
  id: number;
  type: QType;
  text: string;
  marks: string;
  is_required: boolean;
  choices: { id: number; text: string }[];
};
export type AnswerValue = number | number[] | boolean | string | null;
export type AttemptPayload = {
  public_id: string;
  exam: {
    public_id: string;
    title: string;
    course_code: string;
    course_name: string;
    allow_backtrack: boolean;
    grace_seconds: number;
    max_attempts: number;
  };
  attempt_no: number;
  status: "in_progress" | "submitted" | "auto_submitted" | "invalidated";
  started_at: string;
  deadline_at: string;
  server_time: string;
  last_saved_at: string | null;
  questions: ExamQuestion[];
  answers: Record<string, AnswerValue>;
};

export const TYPE_LABEL: Record<QType, string> = {
  single: "اختيار واحد",
  multiple: "اختيارات متعددة",
  true_false: "صح / خطأ",
  fill_blank: "إكمال فراغ",
  short_answer: "إجابة قصيرة",
  essay: "مقالي",
};

/** Milliseconds to add to Date.now() to get the server's clock (docs/05 §8.5). */
export function clockOffset(serverTime: string): number {
  return new Date(serverTime).getTime() - Date.now();
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Answers not yet confirmed by the server survive reloads and outages here. */
export function pendingStore(attemptId: string) {
  const key = `exam:${attemptId}:pending`;
  // The queue lives in memory and is mirrored to the device when the browser allows it: with
  // storage blocked or full, sync still works from memory and the page can warn that a reload
  // would lose what has not reached the server (review 2026-10-04, C7).
  let memory: Record<string, AnswerValue> = {};
  let persisted = true;
  try {
    memory = JSON.parse(localStorage.getItem(key) || "{}") as Record<string, AnswerValue>;
  } catch {
    memory = {};
  }
  const write = () => {
    try {
      if (Object.keys(memory).length) localStorage.setItem(key, JSON.stringify(memory));
      else localStorage.removeItem(key);
      persisted = true;
    } catch {
      persisted = false;
    }
  };
  return {
    read: (): Record<string, AnswerValue> => ({ ...memory }),
    put(qid: number, value: AnswerValue) {
      memory = { ...memory, [qid]: value };
      write();
    },
    done(qid: number, value: AnswerValue) {
      if (JSON.stringify(memory[qid]) === JSON.stringify(value)) {
        const next = { ...memory };
        delete next[qid];
        memory = next;
        write();
      }
    },
    clear() {
      memory = {};
      write();
    },
    /** False while the device refuses to keep the queue: it lives in this tab only. */
    persisted: () => persisted,
  };
}

export function flagsStore(attemptId: string) {
  const key = `exam:${attemptId}:flags`;
  return {
    read(): number[] {
      try {
        return JSON.parse(localStorage.getItem(key) || "[]") as number[];
      } catch {
        return [];
      }
    },
    write(ids: number[]) {
      try {
        localStorage.setItem(key, JSON.stringify(ids));
      } catch {
        /* ignore */
      }
    },
  };
}

/** Question text may carry ```code``` fences; split them for rendering. */
export function textParts(text: string): { code: boolean; value: string }[] {
  return text
    .split("```")
    .map((value, i) => ({ code: i % 2 === 1, value: value.replace(/^\n|\n$/g, "") }));
}

export function answered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}
