// Review 2026-11-16: a lecture's video plays from a signed link that lasts ten minutes; a longer
// lecture must not stop when it expires. The player asks for a new link and goes on from where
// it was.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { api } from "../lib/api";
import { LecturePlayer } from "./LecturePlayer";

vi.mock("../lib/api", () => ({ api: { GET: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("asks for a new link when the old one stops answering, and resumes at the same place", async () => {
  const get = vi.mocked(api.GET);
  get
    .mockResolvedValueOnce({ data: { url: "https://cdn.test/v.mp4?token=1" } } as never)
    .mockResolvedValueOnce({ data: { url: "https://cdn.test/v.mp4?token=2" } } as never);
  const { container } = render(
    <LecturePlayer
      title="المحاضرة 1"
      source={{ kind: "hosted", id: "v1", provider: "local", status: "ready" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "تشغيل: المحاضرة 1" }));
  const video = await waitFor(() => {
    const found = container.querySelector("video");
    expect(found).not.toBeNull();
    return found as HTMLVideoElement;
  });
  expect(video.getAttribute("src")).toBe("https://cdn.test/v.mp4?token=1");

  Object.defineProperty(video, "currentTime", { value: 754, writable: true });
  fireEvent.error(video);
  await waitFor(() => expect(video.getAttribute("src")).toBe("https://cdn.test/v.mp4?token=2"));
  expect(get).toHaveBeenCalledTimes(2);

  Object.defineProperty(video, "duration", { value: 3600 });
  video.currentTime = 0;
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(754);
});
