import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";
import { uploadBackup } from "./backupUpload";

afterEach(() => vi.restoreAllMocks());

const ok = (data: unknown, status = 200) =>
  ({ data, response: new Response(null, { status }) }) as never;
const refused = (error: unknown, status: number) =>
  ({ error, response: new Response(null, { status }) }) as never;

function start(chunk: number, size: number) {
  vi.spyOn(api, "POST").mockResolvedValue(ok({ id: "up1", size, received: 0, chunk }, 201));
}

describe("uploadBackup (owner, 2026-11-14: a backup file on a weak connection)", () => {
  it("sends the file in chunks and reports how far it is", async () => {
    start(4, 10);
    const offsets: number[] = [];
    vi.spyOn(api, "PUT").mockImplementation(async (_path, init) => {
      const { params, body } = init as { params: { query: { offset: number } }; body: Blob };
      offsets.push(params.query.offset);
      return ok({ received: params.query.offset + body.size });
    });
    const seen: number[] = [];
    const id = await uploadBackup(new Blob(["0123456789"]), (p) => seen.push(p.loaded));
    expect(id).toBe("up1");
    expect(offsets).toEqual([0, 4, 8]);
    expect(seen).toEqual([0, 4, 8, 10]);
  });

  it("sends a chunk again after a dropped connection, and goes on from what the server has", async () => {
    start(4, 10);
    const offsets: number[] = [];
    let call = 0;
    vi.spyOn(api, "PUT").mockImplementation(async (_path, init) => {
      const { params, body } = init as { params: { query: { offset: number } }; body: Blob };
      offsets.push(params.query.offset);
      call += 1;
      if (call === 1) throw new TypeError("network");
      // The chunk at 4 did arrive, but its answer was lost: the server says it has 8.
      if (call === 3) return refused({ received: 8 }, 409);
      return ok({ received: params.query.offset + body.size });
    });
    const pauses: number[] = [];
    const id = await uploadBackup(
      new Blob(["0123456789"]),
      () => {},
      async (ms) => void pauses.push(ms),
    );
    expect(id).toBe("up1");
    expect(offsets).toEqual([0, 0, 4, 8]);
    expect(pauses).toEqual([1000]);
  });

  it("gives up after five failures in a row, and at once when the server refuses", async () => {
    start(4, 10);
    const put = vi.spyOn(api, "PUT").mockRejectedValue(new TypeError("network"));
    await expect(
      uploadBackup(
        new Blob(["0123456789"]),
        () => {},
        async () => {},
      ),
    ).rejects.toBeTruthy();
    expect(put).toHaveBeenCalledTimes(5);
    put.mockReset();
    put.mockResolvedValue(refused({ code: "not_found" }, 404));
    await expect(
      uploadBackup(
        new Blob(["0123456789"]),
        () => {},
        async () => {},
      ),
    ).rejects.toEqual({
      code: "not_found",
    });
    expect(put).toHaveBeenCalledTimes(1);
  });
});
