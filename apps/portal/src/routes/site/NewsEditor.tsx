import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Field,
  Notice,
  TextArea,
  problemMessage,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { htmlToText, textToHtml } from "../../lib/richText";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { slugify } from "../../lib/format";

/** Board: SiteManagerAnnouncementNew (news variant, phone); desktop derived. */
export function NewsEditor() {
  const unsaved = useUnsavedChanges();
  const { id } = useParams();
  const creating = !id || id === "new";
  const [slugEdited, setSlugEdited] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const item = useQuery({
    queryKey: ["site", "news", id],
    enabled: !creating,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/content/news/{public_id}", { params: { path: { public_id: id! } } }),
      ) ?? null,
  });
  const [form, setForm] = useState({ slug: "", title: "", summary: "", body: "" });
  useEffect(() => {
    if (item.data)
      setForm({
        slug: item.data.slug,
        title: item.data.title,
        summary: item.data.summary ?? "",
        body: htmlToText(item.data.body),
      });
  }, [item.data]);
  const save = useMutation({
    mutationFn: async (status: "draft" | "published") => {
      const html = textToHtml(form.body);
      const body = { ...form, body: html, status } as never;
      const res = creating
        ? await api.POST("/api/v1/content/news", { body })
        : await api.PATCH("/api/v1/content/news/{public_id}", {
            params: { path: { public_id: id! } },
            body,
          });
      if (!res.data) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      unsaved.saved();
      void client.invalidateQueries({ queryKey: ["site"] });
      if (creating) navigate(`/site/news/${data.public_id}`, { replace: true });
    },
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <PortalShell
      title={form.title || "خبر جديد"}
      subtitle={
        item.data
          ? item.data.status === "published"
            ? "منشور على الموقع — «نشر» يحفظ التعديلات ويعيد بناء الموقع"
            : "مسودة — لا تظهر على الموقع"
          : undefined
      }
      back={{ label: "محتوى الموقع", to: "/site" }}
    >
      <div className="contents" onInput={unsaved.onInput}>
        {/* Desktop: the article; its search preview and publishing beside. */}
        <WithSide
          side={
            <div>
              <Card className="mt-3 p-4 text-sm lg:mt-0">
                <p className="text-xs text-text-muted">معاينة نتيجة البحث</p>
                <p className="mt-1 text-xs text-success-strong" dir="ltr">
                  ecst.edu.sd › news › {form.slug || "…"}
                </p>
                <p className="font-semibold text-info-strong">{form.title || "العنوان"}</p>
                <p className="text-text-muted">{form.summary || "المقتطف"}</p>
              </Card>
              {save.isError && (
                <div className="mt-3">
                  <Notice>{problemMessage(save.error)}</Notice>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => save.mutate("draft")}
                  disabled={!form.slug || !form.title || save.isPending}
                >
                  حفظ مسودة
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => save.mutate("published")}
                  disabled={!form.slug || !form.title || !form.body || save.isPending}
                >
                  نشر
                </Button>
              </div>
            </div>
          }
        >
          <Card>
            <Field
              label="العنوان"
              value={form.title}
              onChange={(e) =>
                set({
                  title: e.target.value,
                  // New items take their link from the title until the link is edited by hand.
                  ...(creating && !slugEdited ? { slug: slugify(e.target.value, 120) } : {}),
                })
              }
            />
            <Field
              label="الرابط"
              dir="ltr"
              value={form.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set({ slug: e.target.value });
              }}
              hint="يُملأ من العنوان تلقائيًا؛ يمكن تعديله (حروف وأرقام وشرطات)"
            />
            <Field
              label="المقتطف (يظهر في القوائم ونتائج البحث)"
              value={form.summary}
              maxLength={300}
              onChange={(e) => set({ summary: e.target.value })}
              hint={`${form.summary.length} / 160`}
            />
            <TextArea
              label="المحتوى"
              value={form.body}
              onChange={(e) => set({ body: e.target.value })}
            />
          </Card>
        </WithSide>
      </div>
    </PortalShell>
  );
}
