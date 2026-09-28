import { useMutation } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  SectionLabel,
  TextArea,
  problemMessage,
  WithSide,
} from "../../components/ui";
import { api } from "../../lib/api";
import { asForm, formData } from "../../lib/upload";

const CATEGORIES = [
  { key: "exams", label: "الامتحانات" },
  { key: "academic", label: "أكاديمية" },
  { key: "conduct", label: "السلوك" },
  { key: "general", label: "عامة" },
] as const;

/** Board: StudentAffairsRegulationNew (phone). Desktop: derived. The audience is all students. */
export function RegulationNew() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["key"]>("exams");
  const [ack, setAck] = useState(true);
  const [isPublic, setPublic] = useState(false);
  const [effective, setEffective] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      let fileId: string | null = null;
      if (file) {
        const { data, error } = await api.POST("/api/v1/files", {
          body: formData({ file, purpose: "regulation" }) as never,
          ...asForm,
        });
        if (!data) throw error;
        fileId = data.public_id;
      }
      const { data, error } = await api.POST("/api/v1/regulations", {
        body: {
          title,
          body,
          category,
          requires_acknowledgement: ack,
          is_public: isPublic,
          effective_from: effective || null,
          file: fileId,
        },
      });
      if (!data) throw error;
      if (publish) {
        const res = await api.POST("/api/v1/regulations/{public_id}/publish", {
          params: { path: { public_id: data.public_id } },
        });
        if (!res.response.ok) throw res.error;
      }
      return data;
    },
    onSuccess: (data) => navigate(`/regulations/${data.public_id}`),
  });

  return (
    <PortalShell
      title="نشر لائحة"
      back={{ label: "اللوائح", to: "/regulations" }}
      subtitle="النشر يُشعر كل الطلاب؛ الإصدار السابق يُؤرشف ولا يُحذف."
    >
      {/* Desktop: the text on the main side, its settings and the actions beside it. */}
      <WithSide
        side={
          <div>
            <SectionLabel>الإقرار والسريان</SectionLabel>
            <Card className="divide-y divide-border-soft">
              <label className="flex min-h-14 items-center justify-between px-4 text-sm text-text">
                يتطلب إقرار الاطلاع
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-primary)]"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
              </label>
              <label className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm text-text">
                <span>
                  تُنشر على موقع الكلية
                  <span className="block text-xs text-text-muted">
                    يراها الزوار في «اللوائح» بعد نشرها، مع ملف PDF إن وُجد
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-primary)]"
                  checked={isPublic}
                  onChange={(e) => setPublic(e.target.checked)}
                />
              </label>
              <Field
                label="تاريخ السريان"
                type="date"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
              />
            </Card>
            {save.isError && (
              <div className="mt-3">
                <Notice>{problemMessage(save.error)}</Notice>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                disabled={!title || save.isPending}
                onClick={() => save.mutate(false)}
              >
                حفظ مسودة
              </Button>
              <Button
                className="flex-1"
                disabled={!title || (!body && !file) || save.isPending}
                onClick={() => save.mutate(true)}
              >
                نشر اللائحة
              </Button>
            </div>
          </div>
        }
      >
        <SectionLabel>اللائحة</SectionLabel>
        <Card>
          <Field
            label="العنوان"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <TextArea
            label="النص أو ملخص للطالب"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Card>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <label className="mt-3 flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-alt px-4 text-sm text-text-muted hover:border-primary">
          <FileUp size={20} aria-hidden className="text-primary" />
          {file ? (
            <span className="font-semibold text-text">{file.name}</span>
          ) : (
            "إرفاق PDF (اختياري)"
          )}
          <input
            type="file"
            accept=".pdf"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </WithSide>
    </PortalShell>
  );
}
