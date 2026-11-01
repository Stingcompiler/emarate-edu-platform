import { createApiClient } from "@ecst/api";

/** The visitor's 30-minute session (email + OTP), kept for this tab only. */
const KEY = "ecst-visitor";

export type VisitorSession = { token: string; expires_at: string; name: string; email: string };

export function readSession(): VisitorSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as VisitorSession;
    return new Date(session.expires_at).getTime() > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session: VisitorSession | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

/** API client that sends `Authorization: Visitor <token>` (no cookies, no CSRF). */
export const visitorApi = createApiClient();
visitorApi.use({
  onRequest({ request }) {
    const session = readSession();
    if (session && request.url.includes("/api/visitor/"))
      request.headers.set("Authorization", `Visitor ${session.token}`);
    return request;
  },
});

/** The visitor's Authorization header, for the uploads sent outside the typed client. */
export function visitorAuth(): Record<string, string> {
  const session = readSession();
  return session ? { Authorization: `Visitor ${session.token}` } : {};
}

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, Math.min(6, user.length))}***@${domain}`;
}

export type Field = {
  key: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "email"
    | "phone"
    | "date"
    | "select"
    | "multiselect"
    | "boolean"
    | "file"
    | "note"
    | "year"
    | "money"
    | "consent";
  label: string;
  required?: boolean;
  options?: string[];
  /** The guide's line for this field: shown under «تعليمات» and in the filling guide. */
  help?: string;
  /** An example of a good answer, shown with the help. */
  example?: string;
  min?: number;
  max?: number;
  pattern?: string;
  accept?: string[];
  max_mb?: number;
  /** Who fills it (owner, 2026-11-01): the applicant (default), staff then released to the
   *  applicant, or staff only. The applicant's form never carries the last two. */
  audience?: "applicant" | "release" | "staff";
  /** Half a row beside another half on large screens; always one column on phones. */
  width?: "full" | "half";
  show_if?: { key: string; equals?: unknown; in?: unknown[] };
};
export type Section = { title?: string; description?: string; fields?: Field[] };
export type FormSchema = {
  /** What the applicant reads at the top of the form and of the guide. */
  title?: string;
  intro?: string;
  steps?: { title?: string; sections?: Section[] }[];
};

export function fieldsOf(schema: FormSchema | null | undefined): Field[] {
  return sectionsOf(schema).flatMap((sec) => sec.fields ?? []);
}

export function sectionsOf(schema: FormSchema | null | undefined): Section[] {
  return (schema?.steps ?? []).flatMap((s) => s.sections ?? []);
}

/** Whether a field shows for these answers (the server applies the same rule). */
export function shown(field: Field, answers: Record<string, unknown>): boolean {
  const rule = field.show_if;
  if (!rule) return true;
  const value = answers[rule.key];
  return rule.in ? rule.in.includes(value) : value === rule.equals;
}

/** What a reader is told about a condition, in the guide (spec §7). */
export function conditionText(field: Field, fields: Field[]): string | null {
  const rule = field.show_if;
  if (!rule) return null;
  const target = fields.find((f) => f.key === rule.key)?.label ?? rule.key;
  const values = (rule.in ?? [rule.equals]).map(String).join(" أو ");
  return `يظهر عند اختيار «${values}» في «${target}»`;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُقدَّم",
  under_review: "قيد المراجعة",
  missing_documents: "مستندات ناقصة",
  eligible: "مؤهل",
  accepted: "مقبول",
  rejected: "مرفوض",
  waitlisted: "قائمة الانتظار",
  registered: "سُجّل طالبًا",
  activated: "فعّل حسابه",
  withdrawn: "منسحب",
  expired: "منتهٍ",
};
export const STATUS_TONE: Record<string, string> = {
  draft: "draft",
  submitted: "open",
  under_review: "open",
  missing_documents: "pending",
  eligible: "approved",
  accepted: "approved",
  rejected: "rejected",
  waitlisted: "pending",
  registered: "approved",
  activated: "approved",
  withdrawn: "closed",
  expired: "closed",
};
