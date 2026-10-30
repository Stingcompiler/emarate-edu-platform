import { expect, it } from "vitest";

import { youTubeId } from "./LecturePlayer";

it("finds the video id in YouTube's usual addresses, and nothing elsewhere", () => {
  expect(youTubeId("https://www.youtube.com/watch?v=abc123XYZ_-")).toBe("abc123XYZ_-");
  expect(youTubeId("https://youtu.be/abc123XYZ_-?t=30")).toBe("abc123XYZ_-");
  expect(youTubeId("https://m.youtube.com/watch?v=abc123")).toBe("abc123");
  expect(youTubeId("https://www.youtube.com/shorts/abc123XYZ")).toBe("abc123XYZ");
  expect(youTubeId("https://www.youtube.com/embed/abc123XYZ")).toBe("abc123XYZ");
  expect(youTubeId("https://example.com/watch?v=abc123")).toBeNull();
  expect(youTubeId("not a url")).toBeNull();
});
