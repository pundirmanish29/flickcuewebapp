import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVE_TIMEOUT, DriveError, findRemoteFileId } from "./drive";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Drive requests", () => {
  it("give up when Drive never answers, so sync can't sit on \"Syncing…\" for good", async () => {
    vi.useFakeTimers();
    // A stalled connection: the request only ends when it is aborted.
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));

    const outcome = findRemoteFileId("token").then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(DRIVE_TIMEOUT + 1);

    const error = await outcome;
    expect(error).toBeInstanceOf(DriveError);
    expect((error as DriveError).status).toBe(0);
    expect((error as DriveError).message).toMatch(/too long/i);
  });

  it("pass a quick answer through untouched", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ files: [{ id: "abc" }] }), { status: 200 }));
    await expect(findRemoteFileId("token")).resolves.toBe("abc");
  });

  it("still report Drive's own errors with their status", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 401 }));
    const error = await findRemoteFileId("token").then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect((error as DriveError).status).toBe(401);
  });
});
