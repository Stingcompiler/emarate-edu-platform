import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Users } from "lucide-react";
import { type FormEvent, useState } from "react";

import { PortalShell } from "../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Notice,
  SectionLabel,
  TextArea,
  problemMessage,
} from "../components/ui";
import { api, ok } from "../lib/api";

type Option = Schemas["AudienceOption"];
type Category = Schemas["SendCategoryEnum"];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "course", label: "أكاديمي" },
  { key: "college", label: "الكلية" },
  { key: "results", label: "النتائج" },
];

/**
 * Board: AdminNotify (phone). Desktop: no board — the form and the phone
 * preview side by side in the desktop shell (docs/06 §9).
 */
export function Compose() {
  const client = useQueryClient();
  const options = useQuery({
    queryKey: ["notifications", "audiences"],
    queryFn: async () => ok(await api.GET("/api/v1/notifications/sent/audiences")) ?? [],
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [category, setCategory] = useState<Category>("course");
  const [urgent, setUrgent] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const audience: Option | undefined = picked === null ? undefined : options.data?.[picked];

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/notifications/sent", {
        body: {
          title: title.trim(),
          body: body.trim(),
          action_url: link.trim(),
          category,
          priority: urgent ? "urgent" : "normal",
          audience: audience!.audience,
          channels: [
            "inapp",
            ...(push ? (["push"] as const) : []),
            ...(email ? (["email"] as const) : []),
          ],
        },
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: () => {
      setSent(`أُرسل «${title.trim()}» إلى ${audience!.label}.`);
      setTitle("");
      setBody("");
      setLink("");
      void client.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSent(null);
    send.mutate();
  }

  const ready = audience && title.trim().length > 0 && !send.isPending;
  const sendLabel = audience
    ? `إرسال الآن إلى ${audience.count.toLocaleString("ar-u-nu-latn")} ${audience.count === 1 ? "مستلم" : "مستلمين"}`
    : "اختر الجمهور";

  return (
    <PortalShell
      title="إشعار جديد"
      subtitle="الجمهور مقيّد بنطاقك"
      back={{ label: "الإشعارات", to: "/notifications" }}
    >
      {options.isPending ? null : !options.data?.length ? (
        <Card>
          <EmptyState icon={<Users size={24} aria-hidden />} title="لا جمهور متاح لك الآن">
            يرسل الأستاذ لطلاب مواده في الفصل الحالي، ويحتاج المعيد إذنًا من الأستاذ أو القسم.
          </EmptyState>
        </Card>
      ) : (
        <form
          onSubmit={submit}
          className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8"
        >
          <div>
            <SectionLabel>إلى</SectionLabel>
            <AudiencePicker options={options.data} picked={picked} onPick={setPicked} />

            <SectionLabel>الرسالة</SectionLabel>
            <Card>
              <Field
                label="العنوان"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
              />
              <TextArea
                label="النص"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
              />
              <Field
                label="رابط إجراء (اختياري)"
                dir="ltr"
                placeholder="https://… أو /notifications"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </Card>

            <SectionLabel>القنوات والفئة</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <Chip active disabled title="كل إشعار يصل إلى صندوق الإشعارات">
                داخل التطبيق
              </Chip>
              <Chip active={push} onClick={() => setPush(!push)}>
                Push
              </Chip>
              <Chip active={email} onClick={() => setEmail(!email)}>
                بريد
              </Chip>
              <span className="mx-1 w-px self-stretch bg-border-soft" aria-hidden />
              {CATEGORIES.map((c) => (
                <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                  {c.label}
                </Chip>
              ))}
              <Chip active={urgent} onClick={() => setUrgent(!urgent)}>
                عاجل
              </Chip>
            </div>
          </div>

          <aside className="mt-6 lg:sticky lg:top-6 lg:mt-0">
            <SectionLabel>معاينة على الهاتف</SectionLabel>
            <Preview title={title} body={body} urgent={urgent} />
            <div className="mt-5 space-y-3">
              {sent && <Notice tone="success">{sent}</Notice>}
              {send.isError && <Notice>{problemMessage(send.error)}</Notice>}
            </div>
            <div data-dock className="sticky bottom-24 z-[5] mt-3 lg:static">
              <Button type="submit" className="w-full shadow-md lg:shadow-none" disabled={!ready}>
                <Send size={18} aria-hidden className="rtl:-scale-x-100" />
                {send.isPending ? "جارٍ الإرسال…" : sendLabel}
              </Button>
            </div>
          </aside>
        </form>
      )}
    </PortalShell>
  );
}

const GROUP_LABEL: Record<string, string> = {
  cohort: "طلاب مستوى محدد",
  course: "طلاب مادة محددة",
};

/** One radio per single audience; cohorts and courses become a radio + picker (board AdminNotify). */
function AudiencePicker({
  options,
  picked,
  onPick,
}: {
  options: Option[];
  picked: number | null;
  onPick: (index: number) => void;
}) {
  const indexed = options.map((option, index) => ({ option, index }));
  const rows: { key: string; items: typeof indexed }[] = [];
  for (const entry of indexed) {
    const multi = entry.option.group === "cohort" || entry.option.group === "course";
    const key = multi ? entry.option.group : `single-${entry.index}`;
    const row = rows.find((r) => r.key === key);
    if (row) row.items.push(entry);
    else rows.push({ key, items: [entry] });
  }
  return (
    <Card className="divide-y divide-border-soft overflow-hidden">
      {rows.map(({ key, items }) => {
        const first = items[0]!; // every row has at least one audience
        const single = items.length === 1 && key.startsWith("single-");
        const chosen = items.find((i) => i.index === picked);
        const label = single ? first.option.label : (GROUP_LABEL[key] ?? key);
        return (
          <div key={key} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <label className="flex flex-1 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="audience"
                className="size-5 accent-[var(--color-primary)]"
                checked={!!chosen}
                onChange={() => onPick((chosen ?? first).index)}
              />
              <span className="text-sm font-medium text-text">{label}</span>
            </label>
            {single ? (
              <span className="text-sm text-text-muted">
                {first.option.count.toLocaleString("ar-u-nu-latn")}
              </span>
            ) : (
              <select
                aria-label={label}
                className="min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text sm:w-auto sm:max-w-72"
                value={chosen?.index ?? ""}
                onChange={(e) => onPick(Number(e.target.value))}
              >
                <option value="" disabled>
                  اختر…
                </option>
                {items.map(({ option, index }) => (
                  <option key={index} value={index}>
                    {option.label} · {option.count.toLocaleString("ar-u-nu-latn")}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function Preview({ title, body, urgent }: { title: string; body: string; urgent: boolean }) {
  return (
    <div className="rounded-2xl bg-navy-800 p-3">
      <div className="flex gap-3 rounded-xl bg-surface/95 p-3 shadow-sm">
        <img
          src="/favicon.svg"
          alt=""
          width={36}
          height={36}
          className="size-9 rounded-lg bg-white"
        />
        <div className="min-w-0 flex-1">
          <p className="flex justify-between text-xs text-text-muted">
            <span>بوابة الكلية{urgent ? " · عاجل" : ""}</span>
            <span>الآن</span>
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-text">{title || "عنوان الإشعار"}</p>
          <p className="line-clamp-2 text-sm text-text-muted">{body || "نص الإشعار يظهر هنا."}</p>
        </div>
      </div>
    </div>
  );
}
