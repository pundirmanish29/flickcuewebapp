import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVE_TIMEOUT, DriveError, deleteAppFile, downloadAppFile, findRemoteFileId, uploadAppFile } from "./drive";

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

describe("ticket files", () => {
  it("are uploaded into the private app folder, with the file's own type", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ id: "file-1" }), { status: 200 });
    });
    const id = await uploadAppFile("tok", "flickcue-ticket-1.png", new Blob(["PNGDATA"], { type: "image/png" }));
    expect(id).toBe("file-1");
    expect(sent!.url).toContain("uploadType=multipart");
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = await (sent!.init.body as Blob).text();
    expect(body).toContain('"parents":["appDataFolder"]');
    expect(body).toContain('"name":"flickcue-ticket-1.png"');
    expect(body).toContain("Content-Type: image/png");
    expect(body).toContain("PNGDATA");
  });

  it("are downloaded as they were stored", async () => {
    let asked = "";
    vi.stubGlobal("fetch", async (url: string) => {
      asked = url;
      return new Response("PDFBYTES", { status: 200 });
    });
    const blob = await downloadAppFile("tok", "file/1");
    expect(asked).toContain("/files/file%2F1?alt=media");
    expect(await blob.text()).toBe("PDFBYTES");
  });

  it("are deleted, and one already gone counts as deleted", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      methods.push(String(init.method));
      return new Response("", { status: 404 });
    });
    await expect(deleteAppFile("tok", "gone")).resolves.toBeUndefined();
    expect(methods).toEqual(["DELETE"]);
    vi.stubGlobal("fetch", async () => new Response("no", { status: 403 }));
    await expect(deleteAppFile("tok", "x")).rejects.toBeInstanceOf(DriveError);
  });
});
