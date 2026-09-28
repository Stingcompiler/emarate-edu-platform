import { useQuery } from "@tanstack/react-query";
import { Check, Plus, ScrollText } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  EmptyState,
  SectionLabel,
  StatusBadge,
  STATUS_LABELS,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import { count, N } from "../../lib/format";

const date = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" });

/** Board: StudentRegulations (phone). Staff see drafts and acknowledgement counts. Desktop: derived. */
export function Regulations() {
  const me = useMe();
  const staff = can(me.data, "regulations.manage");
  const list = useQuery({
    queryKey: ["regulations"],
    queryFn: async () => (await api.GET("/api/v1/regulations")).data?.results ?? [],
  });
  const items = list.data ?? [];
  const needed = items.filter((r) => r.requires_acknowledgement && r.acknowledged === false);
  const rest = items.filter((r) => !needed.includes(r));

  return (
    <PortalShell
      title="اللوائح والضوابط"
      subtitle="من أمين شؤون الطلاب · الإقرار يُسجَّل باسمك ووقته"
      titleAction={
        staff ? (
          <Link to="/regulations/new">
            <Button className="min-h-9 px-3">
              <Plus size={16} aria-hidden />
              لائحة
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="max-w-3xl">
        {!items.length && !list.isPending && (
          <Card>
            <EmptyState icon={<ScrollText size={24} aria-hidden />} title="لا لوائح منشورة" />
          </Card>
        )}
        {needed.length > 0 && (
          <>
            <SectionLabel>تتطلب إقرارك</SectionLabel>
            <Card className="divide-y divide-border-soft">
              {needed.map((r) => (
                <Link
                  key={r.public_id}
                  to={`/regulations/${r.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <Version v={r.version} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">{r.title}</span>
                    {r.effective_from && (
                      <span className="text-xs text-text-muted">
                        سارية من {date.format(new Date(r.effective_from))}
                      </span>
                    )}
                  </span>
                  <Button className="min-h-9 px-3">اقرأ وأقرّ</Button>
                </Link>
              ))}
            </Card>
          </>
        )}
        {rest.length > 0 && (
          <>
            <SectionLabel>{staff ? "كل اللوائح" : "للاطلاع"}</SectionLabel>
            <Card className="divide-y divide-border-soft">
              {rest.map((r) => (
                <Link
                  key={r.public_id}
                  to={`/regulations/${r.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <Version v={r.version} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">{r.title}</span>
                    <span className="text-xs text-text-muted">
                      {staff && r.acknowledgements_count !== null && r.requires_acknowledgement
                        ? `${count(r.acknowledgements_count, N.acknowledgement)}`
                        : r.file_detail
                          ? "PDF"
                          : "نص"}
                    </span>
                  </span>
                  {r.acknowledged ? (
                    <Check size={20} className="text-success" aria-label="أقررت بها" />
                  ) : (
                    staff && (
                      <StatusBadge status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
                    )
                  )}
                </Link>
              ))}
            </Card>
          </>
        )}
      </div>
    </PortalShell>
  );
}

function Version({ v }: { v: string }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-alt text-center leading-tight">
      <span className="text-[11px] text-text-muted">v</span>
      <span className="text-sm font-bold text-text">{v}</span>
    </span>
  );
}
