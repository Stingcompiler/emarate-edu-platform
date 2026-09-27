import { Link } from "react-router";

import { AuthLayout, Button } from "../components/ui";

/** Board: SharedNotFound (phone); desktop uses the centred card. */
export function NotFound() {
  return (
    <AuthLayout title="الصفحة غير موجودة" subtitle="ربما نُقلت أو لم تُضف بعد.">
      <Link to="/">
        <Button className="w-full">العودة إلى البوابة</Button>
      </Link>
    </AuthLayout>
  );
}
