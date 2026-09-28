import { useState } from "react";
import { useNavigate } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card } from "../../components/ui";

/** Results staff: open a student's official transcript for printing. */
export function TranscriptLookup() {
  const navigate = useNavigate();
  const [number, setNumber] = useState("");
  return (
    <PortalShell
      title="السجل الأكاديمي"
      subtitle="كشف رسمي بالنتائج المعتمدة والمنشورة، جاهز للطباعة أو الحفظ PDF"
    >
      <Card className="flex max-w-lg flex-col gap-3 p-4 sm:flex-row">
        <input
          dir="ltr"
          value={number}
          onChange={(e) => setNumber(e.target.value.trim())}
          placeholder="26-IT-0001"
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 font-mono text-sm"
        />
        <Button
          disabled={!number}
          onClick={() => navigate(`/print/transcript/${encodeURIComponent(number)}`)}
        >
          فتح الكشف
        </Button>
      </Card>
    </PortalShell>
  );
}
