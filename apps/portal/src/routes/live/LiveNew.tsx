import { useMutation, useQuery } from "@tanstack/react-query";
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
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";

/** Board: TeacherLiveNew (phone); desktop derived. The link is visible only to those in scope. */
export function LiveNew() {
  const navigate = useNavigate();
  const courses = useQuery({
    queryKey: ["me", "courses"],
    queryFn: async () => (await api.GET("/api/v1/me/courses")).data ?? [],
  });
  const teaching = (courses.data ?? []).filter((c) => c.my_role !== "student");
  const [offering, setOffering] = useState("");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState<"teams" | "meet" | "zoom" | "other">("teams");
  const [url, setUrl] = useState("");
  const [date, setDate] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const save = useMutation({
    mutationFn: async () => {
      const at = (hhmm: string) => new Date(`${date}T${hhmm}`).toISOString();
      const { data, error } = await api.POST("/api/v1/live-sessions", {
        body: {
          scope: "offering",
          offering: Number(offering || teaching[0]?.offering_id),
          title,
          provider,
          join_url: url,
          starts_at: at(start),
          ends_at: at(end),
        } as never,
      });
      if (!data) throw error;
    },
    onSuccess: () => navigate("/live"),
  });
  return (
    <PortalShell
      title="جلسة بث جديدة"
      subtitle="الرابط من المزوّد الخارجي — لا يراه إلا المسجلون في النطاق"
      back={{ label: "البث", to: "/live" }}
    >
      <div className="max-w-2xl">
        <SectionLabel>الجلسة</SectionLabel>
        <Card>
          <Field label="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="block px-4 py-2.5">
            <span className="block text-xs text-text-muted">المادة</span>
            <select
              className="mt-1 block min-h-10 w-full bg-transparent text-base text-text"
              value={offering}
              onChange={(e) => setOffering(e.target.value)}
            >
              {teaching.map((c) => (
                <option key={c.offering_id} value={c.offering_id}>
                  {c.code} — {c.name_ar}
                </option>
              ))}
            </select>
          </label>
        </Card>
        <SectionLabel>المزوّد</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {(["teams", "meet", "zoom", "other"] as const).map((p) => (
            <Chip key={p} active={provider === p} onClick={() => setProvider(p)}>
              {{ teams: "Teams", meet: "Meet", zoom: "Zoom", other: "آخر" }[p]}
            </Chip>
          ))}
        </div>
        <Card className="mt-3">
          <Field
            label="الرابط (https://…)"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Card>
        <SectionLabel>الموعد</SectionLabel>
        <Card>
          <Field
            label="التاريخ"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Field label="من" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <Field label="إلى" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Card>
        <p className="mt-3 px-1 text-xs text-text-muted">
          يُذكَّر الطلاب قبل 30 دقيقة، ويُفتح الرابط لهم قبل البدء بـ 15 دقيقة.
        </p>
        {save.isError && (
          <div className="mt-3">
            <Notice>{problemMessage(save.error)}</Notice>
          </div>
        )}
        <Button
          className="mt-4 w-full"
          onClick={() => save.mutate()}
          disabled={!title || !url || !teaching.length || save.isPending}
        >
          حفظ الجلسة
        </Button>
      </div>
    </PortalShell>
  );
}
