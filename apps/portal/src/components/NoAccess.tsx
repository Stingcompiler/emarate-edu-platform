import { ShieldOff } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "./PortalShell";
import { Button, Card, EmptyState } from "./ui";

/** A page this account's roles don't include (review 2026-09-29, P2): no zeros, no forms. */
export function NoAccess() {
  return (
    <PortalShell title="غير مسموح">
      <Card>
        <EmptyState icon={<ShieldOff size={24} aria-hidden />} title="هذه الصفحة ليست ضمن صلاحياتك">
          إن كنت تحتاجها في عملك فاطلبها من مدير النظام.
          <div className="mt-4">
            <Link to="/">
              <Button className="min-h-11 px-4">العودة إلى الرئيسية</Button>
            </Link>
          </div>
        </EmptyState>
      </Card>
    </PortalShell>
  );
}
