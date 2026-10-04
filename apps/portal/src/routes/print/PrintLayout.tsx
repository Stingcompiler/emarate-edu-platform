import { Printer } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useNavigate } from "react-router";

import { Button } from "../../components/ui";

/**
 * A4 print page, outside the portal chrome. "طباعة / PDF" opens the browser's
 * print dialog, where "Save as PDF" produces the file (no server-side PDF;
 * see docs/02 Phase 8 notes).
 */
export function PrintLayout({
  title,
  meta,
  children,
  footer,
}: {
  title: string;
  meta: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = `${title} — كلية الإمارات`;
  }, [title]);
  return (
    <div className="min-h-dvh bg-bg-subtle py-6 print:bg-white print:py-0">
      <style>
        {"@page { size: A4; margin: 14mm } @media print { html, body { background: #fff } }"}
      </style>
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center gap-2 px-4 print:hidden">
        <Button variant="secondary" className="min-h-9 px-3" onClick={() => navigate(-1)}>
          رجوع
        </Button>
        <Button className="ms-auto min-h-9 px-3" onClick={() => window.print()}>
          <Printer size={16} aria-hidden /> طباعة / حفظ PDF
        </Button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[13px] text-n900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-navy-800 pb-3">
          <div>
            <p className="text-xs font-semibold text-navy-700">كلية الإمارات للعلوم والتكنولوجيا</p>
            <h1 className="mt-1 text-xl font-bold text-navy-900">{title}</h1>
          </div>
          <div className="text-end text-[11px] leading-5 text-n600">{meta}</div>
        </header>
        <div className="mt-4 space-y-5">{children}</div>
        {footer && (
          <footer className="mt-8 border-t border-n200 pt-3 text-[10px] text-n600">{footer}</footer>
        )}
      </article>
    </div>
  );
}

export function PrintTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="bg-n50">
          {head.map((h) => (
            <th key={h} className="border border-n200 px-2 py-1.5 text-start font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid">
            {r.map((c, j) => (
              <td key={j} className="border border-n200 px-2 py-1.5">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrintStats({ items }: { items: [ReactNode, string][] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(([v, l]) => (
        <div key={l} className="rounded border border-n200 p-2">
          <p className="text-lg font-bold">{v}</p>
          <p className="text-[11px] text-n600">{l}</p>
        </div>
      ))}
    </div>
  );
}
