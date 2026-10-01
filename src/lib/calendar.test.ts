import { afterEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_TIMEOUT, CalendarError, applyOps, classifyError, deleteCalendar, deleteEvent, ensureCalendar, insertEvent, listEvents, reviveEvent } from "./calendar";
import { desiredEvents } from "./calendarPlan";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }
type Reply = Response | ((call: Call) => Response);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fail = (status: number, reason = "", message = "nope") => json({ error: { code: status, message, errors: [{ reason }] } }, status);

/** A fetch that answers from a script, in order, and records what it was asked. */
function script(...replies: Reply[]) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const call: Call = { url, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    return typeof reply === "function" ? reply(call) : reply.clone();
  });
  return calls;
}

describe("requests", () => {
  it("carry the token and JSON content type, and ask for no emails to be sent", async () => {
    const calls = script(json({ id: "x" }));
    expect(await insertEvent("tok", "cal", { id: "fcabc" })).toBe("created");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe("Bearer tok");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].url).toContain("/calendars/cal/events");
    expect(calls[0].url).toContain("sendUpdates=none");
  });

  it("give up when Google never answers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const outcome = listEvents("t", "cal", 0).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CALENDAR_TIMEOUT + 1);
    const error = await outcome;
    expect(error).toBeInstanceOf(CalendarError);
    expect((error as CalendarError).status).toBe(0);
    expect((error as CalendarError).message).toMatch(/too long/i);
  });

  it("report Google's own reason with the status", async () => {
    script(fail(403, "rateLimitExceeded", "Rate Limit Exceeded"));
    const error = await listEvents("t", "cal", 0).then(() => null, (e: unknown) => e);
    expect(error).toMatchObject({ status: 403, reason: "rateLimitExceeded" });
    expect((error as Error).message).toContain("Rate Limit Exceeded");
  });
});

describe("events", () => {
  it("are read a page at a time, with deleted ones, from yesterday on", async () => {
    const now = Date.UTC(2026, 8, 24, 12);
    const calls = script(
      json({ items: [{ id: "a", status: "confirmed" }, { id: "b", status: "cancelled" }], nextPageToken: "p2" }),
      json({ items: [{ id: "c", status: "tentative" }, { id: 7 }] })
    );
    const events = await listEvents("t", "cal/1", now);
    expect(events).toEqual([{ id: "a", status: "confirmed" }, { id: "b", status: "cancelled" }, { id: "c", status: "tentative" }]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/calendars/cal%2F1/events");
    expect(calls[0].url).toContain("showDeleted=true");
    expect(calls[0].url).toContain(`timeMin=${encodeURIComponent(new Date(now - 86_400_000).toISOString())}`);
    expect(calls[1].url).toContain("pageToken=p2");
  });

  it("count a 409 on insert as already there", async () => {
    script(fail(409, "duplicate"));
    expect(await insertEvent("t", "cal", { id: "fcabc" })).toBe("exists");
  });

  it("still throw other insert errors", async () => {
    script(fail(500));
    await expect(insertEvent("t", "cal", { id: "fcabc" })).rejects.toBeInstanceOf(CalendarError);
  });

  it("count a delete of something already gone (404 or 410) as done", async () => {
    script(fail(404, "notFound"));
    await expect(deleteEvent("t", "cal", "fcabc")).resolves.toBeUndefined();
    script(fail(410, "deleted"));
    await expect(deleteEvent("t", "cal", "fcabc")).resolves.toBeUndefined();
    script(fail(403, "insufficientPermissions"));
    await expect(deleteEvent("t", "cal", "fcabc")).rejects.toBeInstanceOf(CalendarError);
  });

  it("are revived by patching the status back, and made again if Google lost them", async () => {
    const calls = script(json({ id: "fcabc" }));
    await reviveEvent("t", "cal", { id: "fcabc", summary: "Watch: X" });
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/events/fcabc");
    expect(calls[0].body).toMatchObject({ status: "confirmed", summary: "Watch: X" });
    expect((calls[0].body as Record<string, unknown>).id).toBeUndefined();

    const again = script(fail(404, "notFound"), json({ id: "fcabc" }));
    await reviveEvent("t", "cal", { id: "fcabc", summary: "Watch: X" });
    expect(again.map((call) => call.method)).toEqual(["PATCH", "POST"]);
  });
});

describe("ensureCalendar", () => {
  it("uses the first known id that still exists", async () => {
    const calls = script(fail(404, "notFound"), json({ id: "second" }));
    expect(await ensureCalendar("t", ["first", "second"])).toEqual({ id: "second", created: false });
    expect(calls.map((call) => call.url)).toEqual([expect.stringContaining("/calendars/first"), expect.stringContaining("/calendars/second")]);
  });

  it("finds one by name when no known id works", async () => {
    const calls = script(json({ items: [{ id: "other", summary: "Work" }, { id: "found", summary: "FlickCue" }] }));
    expect(await ensureCalendar("t", [""])).toEqual({ id: "found", created: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/users/me/calendarList");
  });

  it("makes one when none exists", async () => {
    const calls = script(json({ items: [] }), json({ id: "new" }));
    expect(await ensureCalendar("t", [])).toEqual({ id: "new", created: true });
    expect(calls[1].method).toBe("POST");
    expect(calls[1].body).toMatchObject({ summary: "FlickCue" });
  });

  it("makes one when listing calendars isn't permitted", async () => {
    const calls = script(fail(403, "insufficientPermissions"), json({ id: "new" }));
    expect(await ensureCalendar("t", [])).toEqual({ id: "new", created: true });
    expect(calls).toHaveLength(2);
  });

  it("stops, rather than making a second calendar, on an error it can't read through", async () => {
    script(fail(401, "authError"));
    await expect(ensureCalendar("t", ["known"])).rejects.toMatchObject({ status: 401 });
  });
});

describe("deleteCalendar", () => {
  it("deletes it, and a calendar already gone counts as deleted", async () => {
    const calls = script(json({}));
    await deleteCalendar("t", "cal");
    expect(calls[0].method).toBe("DELETE");
    script(fail(404, "notFound"));
    await expect(deleteCalendar("t", "cal")).resolves.toBeUndefined();
  });
});

describe("classifyError", () => {
  const kind = (status: number, reason = "") => classifyError(new CalendarError("x", status, reason));
  it("tells sign in again, permission, slow down, API off, gone and try later apart", () => {
    expect(kind(401)).toBe("auth");
    expect(kind(403, "insufficientPermissions")).toBe("permission");
    expect(kind(403, "rateLimitExceeded")).toBe("rate");
    expect(kind(403, "userRateLimitExceeded")).toBe("rate");
    expect(kind(403, "quotaExceeded")).toBe("rate");
    expect(kind(429)).toBe("rate");
    expect(kind(403, "accessNotConfigured")).toBe("api-disabled");
    expect(kind(404)).toBe("missing");
    expect(kind(410)).toBe("missing");
    expect(kind(0)).toBe("network");
    expect(kind(503)).toBe("network");
    expect(kind(400)).toBe("other");
    expect(classifyError(new TypeError("Failed to fetch"))).toBe("network");
  });
});

describe("applyOps", () => {
  const [event] = desiredEvents({ movies: [{ id: "a", title: "Dune", remindAt: Date.now() + 3_600_000, updatedAt: 1 }], deleted: [] }, Date.now());

  it("does each operation in order and reports what it did", async () => {
    const calls = script(json({}));
    const done = await applyOps("t", "cal", [{ type: "delete", id: "old" }, { type: "create", event }, { type: "revive", event }], "Asia/Kolkata", 0);
    expect(calls.map((call) => call.method)).toEqual(["DELETE", "POST", "PATCH"]);
    expect(done).toEqual({ created: [event.id], deleted: ["old"], revived: [event.id] });
    expect((calls[1].body as any).start.timeZone).toBe("Asia/Kolkata");
  });

  it("stops at the first error and says how far it got", async () => {
    script(json({}), fail(401, "authError"));
    const error = await applyOps("t", "cal", [{ type: "delete", id: "one" }, { type: "delete", id: "two" }, { type: "delete", id: "three" }], "UTC", 0).then(() => null, (e: unknown) => e);
    expect(error).toMatchObject({ status: 401, done: { deleted: ["one"] } });
  });
});
