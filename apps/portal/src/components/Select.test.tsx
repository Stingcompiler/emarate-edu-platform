import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select } from "./Select";

afterEach(cleanup);

// The shared pick-one control by keyboard alone (review 2026-11-10, axis 1.7): open with the
// arrows, move, pick with Enter, close with Escape — and the focus comes back to the field.
function Field({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("2");
  return (
    <Select
      aria-label="البرنامج"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange?.(e.target.value);
      }}
    >
      <option value="1">بكالوريوس تقنية المعلومات</option>
      <option value="2">بكالوريوس نظم المعلومات</option>
      <option value="3" disabled>
        دبلوم موقوف
      </option>
      <option value="4">دبلوم الشبكات</option>
    </Select>
  );
}

describe("Select by keyboard (review 2026-11-10)", () => {
  it("opens with the arrow, skips a disabled option, picks with Enter", async () => {
    const picked = vi.fn();
    render(<Field onChange={picked} />);
    const field = screen.getByRole("combobox", { name: "البرنامج" });
    expect(field.getAttribute("aria-expanded")).toBe("false");
    act(() => field.focus());
    fireEvent.keyDown(field, { key: "ArrowDown" });
    const list = await screen.findByRole("listbox");
    expect(field.getAttribute("aria-expanded")).toBe("true");
    // The chosen option is the active one; one step down skips the disabled option.
    const selected = screen.getByRole("option", { selected: true });
    expect(selected.textContent).toContain("نظم المعلومات");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(list.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: /الشبكات/ }).id,
    );
    fireEvent.keyDown(list, { key: "Enter" });
    expect(picked).toHaveBeenCalledWith("4");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field.textContent).toContain("الشبكات");
  });

  it("closes with Escape and gives the focus back", async () => {
    render(<Field />);
    const field = screen.getByRole("combobox", { name: "البرنامج" });
    act(() => field.focus());
    fireEvent.keyDown(field, { key: "ArrowUp" });
    const list = await screen.findByRole("listbox");
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(field.textContent).toContain("نظم المعلومات");
  });
});
