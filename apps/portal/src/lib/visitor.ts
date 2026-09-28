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
    | "note";
  label: string;
  required?: boolean;
  options?: string[];
  help?: string;
  min?: number;
  max?: number;
  show_if?: { key: string; equals: unknown };
};
export type FormSchema = {
  steps?: { title?: string; sections?: { title?: string; fields?: Field[] }[] }[];
};

export function fieldsOf(schema: FormSchema | null | undefined): Field[] {
  return (schema?.steps ?? []).flatMap((s) =>
    (s.sections ?? []).flatMap((sec) => sec.fields ?? []),
  );
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
