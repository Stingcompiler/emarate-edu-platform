import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";

import { DataTable, type Sort, nextSort, orderingOf } from "./DataTable";

afterEach(cleanup);

type Row = { id: string; name: string; n: number };
const rows: Row[] = [
  { id: "a", name: "أحمد", n: 3 },
  { id: "b", name: "يوسف", n: 12 },
];

function Harness() {
  const [sort, setSort] = useState<Sort>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return (
    <>
      <output data-testid="ordering">{orderingOf(sort) ?? "none"}</output>
      <DataTable
        caption="قائمة"
        rows={rows}
        rowId={(r) => r.id}
        sort={sort}
        onSort={setSort}
        selection={{ picked, onChange: setPicked, label: (r) => `تحديد ${r.name}` }}
        bulkBar={<div role="toolbar">إجراءات جماعية</div>}
        columns={[
          { key: "name", header: "الاسم", sort: "name", cell: (r) => r.name },
          { key: "n", header: "العدد", sort: "n", numeric: true, cell: (r) => r.n },
          { key: "plain", header: "ملاحظة", cell: () => "—" },
        ]}
      />
    </>
  );
}

it("the sort has three states: ascending, descending, then the server's own order", () => {
  expect(nextSort(null, "n")).toEqual({ field: "n", dir: "asc" });
  expect(nextSort({ field: "n", dir: "asc" }, "n")).toEqual({ field: "n", dir: "desc" });
  expect(nextSort({ field: "n", dir: "desc" }, "n")).toBeNull();
  expect(nextSort({ field: "n", dir: "desc" }, "name")).toEqual({ field: "name", dir: "asc" });
  expect(orderingOf({ field: "n", dir: "desc" })).toBe("-n");
  expect(orderingOf(null)).toBeUndefined();
});

it("a header cycles through the states and says so to assistive technology", () => {
  render(<Harness />);
  const header = screen.getByRole("columnheader", { name: /العدد/ });
  const button = within(header).getByRole("button");
  expect(header.getAttribute("aria-sort")).toBe("none");
  fireEvent.click(button);
  expect(header.getAttribute("aria-sort")).toBe("ascending");
  expect(screen.getByTestId("ordering").textContent).toBe("n");
  fireEvent.click(button);
  expect(header.getAttribute("aria-sort")).toBe("descending");
  expect(screen.getByTestId("ordering").textContent).toBe("-n");
  fireEvent.click(button);
  expect(header.getAttribute("aria-sort")).toBe("none");
  expect(screen.getByTestId("ordering").textContent).toBe("none");
  // A column without a sort field is a plain header.
  expect(
    within(screen.getByRole("columnheader", { name: "ملاحظة" })).queryByRole("button"),
  ).toBeNull();
});

it("figures are tabular and end-aligned; the bulk bar appears only with a selection", () => {
  render(<Harness />);
  expect(screen.queryByRole("toolbar")).toBeNull();
  const cell = screen.getByRole("cell", { name: "12" });
  expect(cell.className).toContain("num");
  fireEvent.click(screen.getByLabelText("تحديد أحمد"));
  expect(screen.getByRole("toolbar")).toBeTruthy();
  const all = screen.getByLabelText("تحديد كل الصفوف المعروضة") as HTMLInputElement;
  expect(all.indeterminate).toBe(true);
  fireEvent.click(all); // select all
  expect((screen.getByLabelText("تحديد يوسف") as HTMLInputElement).checked).toBe(true);
  fireEvent.click(all); // clear
  expect(screen.queryByRole("toolbar")).toBeNull();
});
