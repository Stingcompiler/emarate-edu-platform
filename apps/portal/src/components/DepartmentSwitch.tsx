import { useSearchParams } from "react-router";

import { useDepartment } from "../lib/department";
import { Picker } from "../lib/reports";

/**
 * Choose the department a department page shows — only when there is a choice (college-wide
 * roles, or a manager of several departments). Kept in `?department=`, so it survives
 * reloads and can be linked to (review 2026-09-29, P6).
 */
export function DepartmentSwitch() {
  const { id, choices } = useDepartment();
  const [params, setParams] = useSearchParams();
  if (choices.length < 2) return null;
  return (
    <div className="mb-3">
      <Picker
        label="القسم"
        value={id}
        items={choices}
        name={(d) => d.name_ar}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          if (value) next.set("department", String(value));
          else next.delete("department");
          setParams(next, { replace: true });
        }}
      />
    </div>
  );
}
