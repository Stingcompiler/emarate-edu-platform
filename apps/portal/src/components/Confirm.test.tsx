import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConfirmProvider, useConfirm } from "./Confirm";

let ask: ReturnType<typeof useConfirm>;
function Grab() {
  ask = useConfirm();
  return null;
}

afterEach(cleanup);

describe("ConfirmProvider (review 2026-09-29, P9)", () => {
  it("focuses «إلغاء» and answers false on Escape", async () => {
    render(
      <ConfirmProvider>
        <Grab />
      </ConfirmProvider>,
    );
    let answer: Promise<boolean>;
    act(() => {
      answer = ask({ title: "حذف السجل؟", confirm: "حذف السجل" });
    });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("إلغاء");
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await expect(answer!).resolves.toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("answers true with the action's own button", async () => {
    render(
      <ConfirmProvider>
        <Grab />
      </ConfirmProvider>,
    );
    let answer: Promise<boolean>;
    act(() => {
      answer = ask({ title: "إلغاء النشر؟", confirm: "إلغاء النشر" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "إلغاء النشر" }));
    await expect(answer!).resolves.toBe(true);
  });
});
