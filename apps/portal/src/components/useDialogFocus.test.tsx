import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it } from "vitest";

import { useDialogFocus } from "./useDialogFocus";

afterEach(cleanup);

function Page() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(open, panel, () => setOpen(false));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        تسليم
      </button>
      <button type="button">خلفية</button>
      {open && (
        <div ref={panel} role="alertdialog" aria-modal="true">
          <button type="button" onClick={() => setOpen(false)}>
            متابعة
          </button>
          <button type="button">تسليم الآن</button>
        </div>
      )}
    </>
  );
}

it("moves focus in, keeps it in, closes on Escape and gives it back (review G1)", () => {
  render(<Page />);
  const opener = screen.getByRole("button", { name: "تسليم" });
  opener.focus();
  fireEvent.click(opener);
  const first = screen.getByRole("button", { name: "متابعة" });
  const last = screen.getByRole("button", { name: "تسليم الآن" });
  expect(document.activeElement).toBe(first);

  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last); // wraps instead of reaching the page behind
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(first);

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});
