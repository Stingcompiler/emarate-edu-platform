import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { UploadStatus } from "./UploadStatus";

afterEach(cleanup);

it("shows the bytes sent, the percentage and a progress bar while uploading", () => {
  render(
    <UploadStatus
      upload={{
        state: "uploading",
        name: "تقرير.pdf",
        progress: { loaded: 512_000, total: 1_024_000 },
      }}
    />,
  );
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  expect(screen.getByText("50٪")).toBeTruthy();
});

it("says success, or the reason with a retry", () => {
  const retry = vi.fn();
  const { rerender } = render(<UploadStatus upload={{ state: "done", name: "a.pdf" }} />);
  expect(screen.getByRole("status").textContent).toContain("تم الرفع بنجاح");
  rerender(
    <UploadStatus
      upload={{ state: "error", name: "a.pdf", message: "الملف أكبر من 10 MB." }}
      onRetry={retry}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("الملف أكبر من 10 MB.");
  fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
  expect(retry).toHaveBeenCalled();
});
