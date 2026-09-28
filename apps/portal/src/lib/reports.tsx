import { useMutation, useQuery } from "@tanstack/react-query";
import { FileDown, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { Button, Card, Notice, problemMessage } from "../components/ui";
import { api } from "./api";

/** Numbers: Arabic digits in prose, "—" when there is no data. */
export const num = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("ar", { maximumFractionDigits: digits });
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${num(n)}٪`);
export const days = (n: number | null | undefined) => (n == null ? "—" : `${num(n, 1)} يوم`);

export const TEACHER_STATUS: Record<string, { label: string; tone: string }> = {
  below: { label: "تحت الحد", tone: "bg-danger-soft text-danger-strong" },
  warn: { label: "تنبيه", tone: "bg-warning-soft text-warning-strong" },
  ok: { label: "ضمن الحدود", tone: "bg-success-soft text-success-strong" },
  none: { label: "بلا مواد", tone: "bg-neutral-soft text-neutral-strong" },
};

export function TeacherStatus({ status }: { status: string }) {
  const s = TEACHER_STATUS[status] ?? TEACHER_STATUS.none!;
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.tone}`}
    >
      {s.label}
    </span>
  );
}

export const TOPIC_LABEL: Record<string, string> = {
  grading: "تأخر التصحيح",
  uploads: "انتظام الرفع",
  live: "البث المباشر",
  replies: "الرد على الطلاب",
  other: "أخرى",
};

export const initials = (name: string) =>
  name
    .replace(/^(د|أ|م)\.\s*/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.replace(/^ال(?=.)/, "")[0])
    .join(" ");

/** A headline number with a caption and an optional comparison line. */
export function Kpi({
  value,
  label,
  note,
  tone,
}: {
  value: ReactNode;
  label: string;
  note?: ReactNode;
  tone?: "danger" | "success";
}) {
  return (
    <Card className="px-4 py-3">
      <p className={`text-2xl font-bold ${tone === "danger" ? "text-danger-strong" : "text-text"}`}>
        {value}
      </p>
      <p className="text-xs text-text-muted">{label}</p>
      {note != null && <p className="mt-1 text-[11px] text-text-muted">{note}</p>}
    </Card>
  );
}

/** Difference against the previous period, signed and coloured when it matters. */
export function Delta({
  now,
  before,
  unit = "",
  better = "up",
}: {
  now: number | null | undefined;
  before: number | null | undefined;
  unit?: string;
  better?: "up" | "down";
}) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span>بلا تغيير</span>;
  const good = better === "up" ? d > 0 : d < 0;
  return (
    <span className={good ? "text-success-strong" : "text-danger-strong"}>
      <bdi>{`${d > 0 ? "+" : "−"}${num(Math.abs(d), 1)}${unit}`}</bdi>
    </span>
  );
}

/** Simple bar chart; the last bar is highlighted (current week / today). */
export function Bars({
  values,
  labels,
  caption,
}: {
  values: number[];
  labels?: string[];
  caption?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <figure>
      <div className="flex h-32 items-end gap-1.5" dir="ltr">
        {values.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] text-text-muted">{num(v)}</span>
            <div
              className={`w-full rounded-t ${i === values.length - 1 ? "bg-primary" : "bg-primary-soft"}`}
              style={{ height: `${Math.max(4, (v / max) * 96)}px` }}
            />
            {labels && <span className="text-[10px] text-text-muted">{labels[i]}</span>}
          </div>
        ))}
      </div>
      {caption && <figcaption className="mt-2 text-xs text-text-muted">{caption}</figcaption>}
    </figure>
  );
}

/** CSV with a BOM so Excel opens Arabic correctly. */
export function downloadCsv(
  name: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type SnapshotBody = {
  kind: "department" | "teachers" | "admissions" | "affairs";
  term?: number;
  department?: number;
  cycle?: number;
  year?: number;
  notes?: string;
};

/** CSV + "PDF" (freeze a snapshot on the server, then open its print view). */
export function ExportBar({ onCsv, snapshot }: { onCsv?: () => void; snapshot: SnapshotBody }) {
  const navigate = useNavigate();
  const freeze = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/report-snapshots", {
        body: snapshot as never,
      });
      if (!data) throw error;
      return data.public_id;
    },
    onSuccess: (id) => navigate(`/print/report/${id}`),
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onCsv && (
        <Button variant="secondary" className="min-h-9 px-3" onClick={onCsv}>
          <FileDown size={16} aria-hidden /> CSV
        </Button>
      )}
      <Button className="min-h-9 px-3" onClick={() => freeze.mutate()} disabled={freeze.isPending}>
        <Printer size={16} aria-hidden /> تصدير PDF
      </Button>
      {freeze.isError && <Notice>{problemMessage(freeze.error)}</Notice>}
    </div>
  );
}

/** Past exports of a kind («تقارير سابقة»). */
export function PastReports({ kind }: { kind: SnapshotBody["kind"] }) {
  const list = useQuery({
    queryKey: ["report-snapshots", kind],
    queryFn: async () =>
      (await api.GET("/api/v1/report-snapshots", { params: { query: { kind } } })).data?.results ??
      [],
  });
  if (!list.data?.length) return null;
  return (
    <Card className="divide-y divide-border-soft">
      <p className="px-4 py-2 text-xs font-semibold text-text-muted">تقارير سابقة</p>
      {list.data.slice(0, 6).map((s) => (
        <Link
          key={s.public_id}
          to={`/print/report/${s.public_id}`}
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-alt"
        >
          <span className="min-w-0 truncate">{s.title}</span>
          <span className="shrink-0 text-xs text-text-muted">
            {new Date(s.created_at).toLocaleDateString("ar")} · PDF
          </span>
        </Link>
      ))}
    </Card>
  );
}

/** Selects shared by the report pages. */
export function Picker<T extends { id: number }>({
  label,
  value,
  items,
  name,
  onChange,
  all,
}: {
  label: string;
  value: number | undefined;
  items: T[];
  name: (t: T) => string;
  onChange: (v: number | undefined) => void;
  all?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className="min-h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text"
      >
        {all && <option value="">{all}</option>}
        {items.map((t) => (
          <option key={t.id} value={t.id}>
            {name(t)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useTerms() {
  return useQuery({
    queryKey: ["terms"],
    queryFn: async () => (await api.GET("/api/v1/terms")).data?.results ?? [],
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.GET("/api/v1/departments")).data?.results ?? [],
  });
}
