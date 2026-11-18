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

it("renews as often as a long lecture needs, but stops after three failures in a row", async () => {
  const get = vi.mocked(api.GET);
  let n = 0;
  get.mockImplementation(
    async () => ({ data: { url: `https://cdn.test/v.mp4?token=${++n}` } }) as never,
  );
  const { container } = render(
    <LecturePlayer
      title="المحاضرة 2"
      source={{ kind: "hosted", id: "v2", provider: "local", status: "ready" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "تشغيل: المحاضرة 2" }));
  const video = await waitFor(() => {
    const found = container.querySelector("video");
    expect(found).not.toBeNull();
    return found as HTMLVideoElement;
  });
  // Six expiries over a long lecture, each followed by playing again: all renewed.
  for (let i = 2; i <= 7; i++) {
    fireEvent.error(video);
    await waitFor(() =>
      expect(video.getAttribute("src")).toBe(`https://cdn.test/v.mp4?token=${i}`),
    );
    fireEvent.playing(video);
  }
  // A fault no new link mends: three tries, then the retry screen.
  for (let i = 8; i <= 10; i++) {
    fireEvent.error(video);
    await waitFor(() =>
      expect(video.getAttribute("src")).toBe(`https://cdn.test/v.mp4?token=${i}`),
    );
  }
  fireEvent.error(video);
  expect(await screen.findByRole("button", { name: "أعد محاولة التشغيل" })).toBeTruthy();
  expect(container.querySelector("video")).toBeNull();
});
