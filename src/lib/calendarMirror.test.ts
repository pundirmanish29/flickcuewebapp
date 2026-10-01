import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCalendarMirror, type CalendarState, type PersistedCalendar } from "./calendarMirror";
import { eventIdFor } from "./calendarPlan";
import { fakeGoogleCalendar } from "./fakeCalendar";
import { CALENDAR_SCOPE, GOOGLE_SCOPE } from "./config";
import type { LibraryDocument, Movie } from "./types";

const NOW = new Date(2026, 8, 24, 15, 0).getTime();
const HOUR = 3_600_000;

const title = (id: string, hours: number | null, over: Partial<Movie> = {}): Movie => ({
  id, title: `Title ${id}`, year: "2020", mediaType: "Movie", tmdbType: "movie", watched: false, updatedAt: 1, createdAt: 1,
  remindAt: hours === null ? null : NOW + hours * HOUR, ...over
});

function setup(movies: Movie[], options: { account?: string; settings?: { calendarMirror: boolean; calendarId: string }; remembered?: PersistedCalendar | null } = {}) {
  const google = fakeGoogleCalendar();
  vi.stubGlobal("fetch", google.fetch);
  const env = {
    library: { movies, deleted: [] } as LibraryDocument,
    settings: options.settings ?? { calendarMirror: true, calendarId: "" },
    persisted: (options.remembered ?? null) as PersistedCalendar | null,
    ready: true,
    account: options.account ?? "me@example.com",
    token: { accessToken: "tok", expiresAt: NOW + HOUR, source: "google" as const, scope: `${GOOGLE_SCOPE} ${CALENDAR_SCOPE}` } as { accessToken: string; expiresAt: number; source: "google"; scope: string } | null,
    now: NOW,
    dropped: 0,
    states: [] as CalendarState[]
  };
  const mirror = createCalendarMirror({
    getLibrary: () => env.library,
    getSettings: () => env.settings,
    setSettings: (patch) => void (env.settings = { ...env.settings, ...patch }),
    syncReady: () => env.ready,
    account: () => env.account,
    getToken: () => env.token,
    dropToken: () => { env.token = null; env.dropped++; },
    load: () => env.persisted,
    save: (value) => void (env.persisted = value),
    onState: (state) => void env.states.push(state),
    now: () => env.now,
    timeZone: () => "Asia/Kolkata",
    gap: 0
  });
  const calendarId = () => env.settings.calendarId;
  const live = () => google.live(calendarId()).sort();
  const ids = (...pairs: [string, number][]) => pairs.map(([id, hours]) => eventIdFor(id, NOW + hours * HOUR)!).sort();
  return { google, env, mirror, calendarId, live, ids };
}

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("turning on", () => {
  it("makes the calendar and one event per reminder still to come", async () => {
    const t = setup([title("a", 2), title("b", 30), title("past", -2), title("none", null), title("watched", 3, { watched: true })]);
    await t.mirror.run();
    expect(t.calendarId()).toMatch(/@group\.calendar\.google\.com$/);
    expect(t.google.calendars.get(t.calendarId())!.summary).toBe("FlickCue");
    expect(t.live()).toEqual(t.ids(["a", 2], ["b", 30]));
    expect(t.mirror.getState()).toMatchObject({ status: "ok", message: "", held: 0 });
    expect(t.mirror.getState().mirrored.sort()).toEqual(t.ids(["a", 2], ["b", 30]));
    expect(t.env.persisted).toMatchObject({ account: "me@example.com", calendarId: t.calendarId() });
  });

  it("writes timed events in the browser's time zone that show as free and pop up at the reminder time", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    const body = t.google.calendars.get(t.calendarId())!.events.get(eventIdFor("a", NOW + 2 * HOUR)!)!.body;
    expect(body.start.timeZone).toBe("Asia/Kolkata");
    expect(body.transparency).toBe("transparent");
    expect(body.reminders.overrides).toEqual([{ method: "popup", minutes: 0 }]);
    expect(body.summary).toBe("Watch: Title a");
  });

  it("asks Google nothing when nothing changed and the last look was recent", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.google.reset();
    await t.mirror.run();
    expect(t.google.calls).toEqual([]);
    expect(t.mirror.getState().status).toBe("ok");
  });

  it("looks again once the last look is old", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.google.reset();
    t.env.now = NOW + 31 * 60_000;
    await t.mirror.run();
    expect(t.google.calls.some((call) => call.method === "GET" && call.path.endsWith("/events"))).toBe(true);
  });
});

describe("keeping in step", () => {
  it("moves an event when its reminder changes", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.env.library = { movies: [title("a", 5)], deleted: [] };
    await t.mirror.run();
    expect(t.live()).toEqual(t.ids(["a", 5]));
  });

  it("removes the event when the title is watched, removed, or its reminder cleared", async () => {
    const t = setup([title("a", 2), title("b", 3), title("c", 4), title("keep", 6)]);
    await t.mirror.run();
    t.env.library = { movies: [title("a", 2, { watched: true }), title("c", null), title("keep", 6)], deleted: [{ id: "b", deletedAt: 5 }] };
    await t.mirror.run();
    expect(t.live()).toEqual(t.ids(["keep", 6]));
  });

  it("leaves an event the person deleted deleted", async () => {
    const t = setup([title("a", 2), title("b", 3)]);
    await t.mirror.run();
    t.google.userDeletes(t.calendarId(), eventIdFor("a", NOW + 2 * HOUR)!);
    t.env.now = NOW + 40 * 60_000;
    await t.mirror.run();
    expect(t.live()).toEqual(t.ids(["b", 3]));
  });

  it("leaves an event the person moved where they put it", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    const id = eventIdFor("a", NOW + 2 * HOUR)!;
    t.google.userMoves(t.calendarId(), id);
    t.env.now = NOW + 40 * 60_000;
    t.google.reset();
    await t.mirror.run();
    expect(t.google.calls.filter((call) => call.method !== "GET")).toEqual([]);
    expect(t.google.calendars.get(t.calendarId())!.events.get(id)!.body.start.dateTime).toBe("2030-01-01T00:00:00.000Z");
  });

  it("brings back an event it deleted itself when the same time is chosen again", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.env.library = { movies: [title("a", 5)], deleted: [] };
    await t.mirror.run();
    t.env.library = { movies: [title("a", 2)], deleted: [] };
    await t.mirror.run();
    expect(t.live()).toEqual(t.ids(["a", 2]));
  });

  it("does not delete reminders whose time has passed", async () => {
    const t = setup([title("soon", 1)]);
    await t.mirror.run();
    t.env.now = NOW + 2 * HOUR;
    t.env.library = { movies: [], deleted: [] };
    await t.mirror.run();
    expect(t.live()).toEqual(t.ids(["soon", 1]));
  });

  it("does the work in batches when there is a lot of it", async () => {
    const many = Array.from({ length: 30 }, (_, i) => title(`m${i}`, i + 1));
    const t = setup(many);
    await t.mirror.run();
    expect(t.live()).toHaveLength(25);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(t.live()).toHaveLength(30);
  });
});

describe("safety", () => {
  it("does nothing until a sync has finished, so an empty library can't empty the calendar", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.env.library = { movies: [], deleted: [] };
    t.env.ready = false;
    t.google.reset();
    await t.mirror.run();
    expect(t.google.calls).toEqual([]);
    expect(t.live()).toEqual(t.ids(["a", 2]));
  });

  it("holds back a mass delete until the person confirms", async () => {
    const t = setup(Array.from({ length: 12 }, (_, i) => title(`m${i}`, i + 1)));
    await t.mirror.run();
    t.env.library = { movies: [], deleted: [] };
    t.env.now = NOW + 40 * 60_000;
    await t.mirror.run();
    expect(t.live()).toHaveLength(12);
    expect(t.mirror.getState()).toMatchObject({ status: "held", held: 12 });
    await t.mirror.run({ allowBulkDelete: true });
    expect(t.live()).toEqual([]);
    expect(t.mirror.getState().status).toBe("ok");
  });

  it("does nothing, and says so, with the switch off", async () => {
    const t = setup([title("a", 2)], { settings: { calendarMirror: false, calendarId: "" } });
    await t.mirror.run();
    t.mirror.schedule();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.google.calls).toEqual([]);
  });

  it("makes one run for a burst of changes", async () => {
    const t = setup([title("a", 2)]);
    t.mirror.schedule();
    t.mirror.schedule();
    t.mirror.schedule();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.google.calls.filter((call) => call.method === "POST" && call.path === "/calendars")).toHaveLength(1);
  });

  it("runs once even when asked twice at the same moment, and again if something changed meanwhile", async () => {
    const t = setup([title("a", 2)]);
    const first = t.mirror.run();
    t.env.library = { movies: [title("a", 2), title("late", 3)], deleted: [] };
    const second = t.mirror.run();
    await Promise.all([first, second]);
    expect(t.live()).toEqual(t.ids(["a", 2], ["late", 3]));
    expect(t.google.calls.filter((call) => call.method === "POST" && call.path === "/calendars")).toHaveLength(1);
  });
});

describe("permission and sign-in", () => {
  it("waits for a reconnect, and says that events already there still go off, when there is no token", async () => {
    const t = setup([title("a", 2)]);
    t.env.token = null;
    await t.mirror.run();
    expect(t.mirror.getState()).toMatchObject({ status: "pending" });
    expect(t.mirror.getState().message).toMatch(/Reconnect Google Calendar/);
    expect(t.google.calls).toEqual([]);
  });

  it("drops the token and waits when Google says to sign in again", async () => {
    const t = setup([title("a", 2)]);
    t.google.failNext(401, "authError");
    await t.mirror.run();
    expect(t.env.dropped).toBe(1);
    expect(t.mirror.getState().status).toBe("pending");
  });

  it("asks for permission when Google refuses it, and remembers", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.env.library = { movies: [title("a", 2), title("b", 3)], deleted: [] };
    t.google.failNext(403, "insufficientPermissions");
    t.google.failNext(403, "insufficientPermissions");
    await t.mirror.run();
    t.env.token = null;
    await t.mirror.run();
    expect(t.mirror.getState()).toMatchObject({ status: "needs-permission", declined: true });
  });

  it("does not ask again on its own after Calendar was left unticked", async () => {
    const t = setup([title("a", 2)]);
    t.mirror.declined();
    t.env.token = null;
    await t.mirror.run();
    expect(t.mirror.getState()).toMatchObject({ status: "needs-permission", declined: true });
    expect(t.mirror.getState().message).toMatch(/wasn't allowed/);
  });

  it("clears the declined mark once it works", async () => {
    const t = setup([title("a", 2)]);
    t.mirror.declined();
    await t.mirror.started();
    expect(t.mirror.getState()).toMatchObject({ status: "ok", declined: false });
  });

  it("says the Calendar API is off when the project hasn't enabled it", async () => {
    const t = setup([title("a", 2)]);
    t.google.failNext(403, "accessNotConfigured");
    await t.mirror.run();
    expect(t.mirror.getState()).toMatchObject({ status: "error" });
    expect(t.mirror.getState().message).toMatch(/isn't switched on/);
  });
});

describe("trouble", () => {
  it("tries again in a minute when Google is busy", async () => {
    const t = setup([title("a", 2)]);
    t.google.failNext(403, "rateLimitExceeded");
    await t.mirror.run();
    expect(t.mirror.getState().status).toBe("error");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.live()).toEqual(t.ids(["a", 2]));
    expect(t.mirror.getState().status).toBe("ok");
  });

  it("tries again when the connection fails", async () => {
    const t = setup([title("a", 2)]);
    const real = t.google.fetch;
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    await t.mirror.run();
    expect(t.mirror.getState().message).toMatch(/Couldn't reach/);
    vi.stubGlobal("fetch", real);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.mirror.getState().status).toBe("ok");
  });

  it("makes the calendar again, once, if it was deleted in Google Calendar", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    const old = t.calendarId();
    t.google.userDeletesCalendar(old);
    t.env.now = NOW + 40 * 60_000;
    await t.mirror.run();
    expect(t.calendarId()).not.toBe(old);
    expect(t.live()).toEqual(t.ids(["a", 2]));
    expect(t.google.calls.filter((call) => call.method === "POST" && call.path === "/calendars")).toHaveLength(2);
  });
});

describe("devices and accounts", () => {
  it("uses the calendar another device made, from the synced settings, instead of making a second", async () => {
    const first = setup([title("a", 2)]);
    await first.mirror.run();
    const second = setup([title("a", 2)], { settings: { calendarMirror: true, calendarId: first.calendarId() } });
    // The second device's Google is the same account: share the first one's calendar.
    second.google.calendars.set(first.calendarId(), first.google.calendars.get(first.calendarId())!);
    await second.mirror.run();
    expect(second.google.calls.some((call) => call.method === "POST" && call.path === "/calendars")).toBe(false);
    expect(second.live()).toEqual(second.ids(["a", 2]));
  });

  it("forgets what another account left on this device", async () => {
    const t = setup([title("a", 2)], {
      account: "new@example.com",
      remembered: { account: "old@example.com", calendarId: "stale@group.calendar.google.com", mirrored: ["x"], deletedByUs: [], fingerprint: "1:1", lastRunAt: NOW, declined: true }
    });
    await t.mirror.run();
    expect(t.calendarId()).not.toBe("stale@group.calendar.google.com");
    expect(t.env.persisted).toMatchObject({ account: "new@example.com", declined: false });
  });

  it("starts out as pending when the switch is on, with the events it remembers", () => {
    const t = setup([], { remembered: { account: "me@example.com", calendarId: "c", mirrored: ["e1"], deletedByUs: [], fingerprint: "", lastRunAt: 0, declined: false } });
    t.mirror.restore();
    expect(t.mirror.getState()).toMatchObject({ status: "pending", mirrored: ["e1"] });
    const off = setup([], { settings: { calendarMirror: false, calendarId: "" } });
    off.mirror.restore();
    expect(off.mirror.getState().status).toBe("off");
  });
});

describe("turning off", () => {
  it("deletes the whole calendar and switches the setting off", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    const id = t.calendarId();
    const result = await t.mirror.stop();
    expect(result).toEqual({ removed: true });
    expect(t.google.calendars.has(id)).toBe(false);
    expect(t.env.settings).toEqual({ calendarMirror: false, calendarId: "" });
    expect(t.env.persisted).toBeNull();
    expect(t.mirror.getState().status).toBe("off");
  });

  it("deletes only the events it made where deleting the calendar isn't allowed", async () => {
    const t = setup([title("a", 2), title("b", 3)]);
    await t.mirror.run();
    const id = t.calendarId();
    t.google.control.deleteCalendarAllowed = false;
    const result = await t.mirror.stop();
    expect(result.removed).toBe(true);
    expect(t.google.live(id)).toEqual([]);
    expect(t.env.settings.calendarMirror).toBe(false);
  });

  it("still switches off, and says the calendar was left, when there is no live token", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.env.token = null;
    expect(await t.mirror.stop()).toEqual({ removed: false });
    expect(t.env.settings.calendarMirror).toBe(false);
    expect(t.google.calendars.size).toBe(1);
  });

  it("is forgotten on this device at sign-out, leaving the calendar and the synced switch", async () => {
    const t = setup([title("a", 2)]);
    await t.mirror.run();
    t.mirror.reset();
    expect(t.env.persisted).toBeNull();
    expect(t.env.settings.calendarMirror).toBe(true);
    expect(t.google.calendars.size).toBe(1);
    expect(t.mirror.getState().status).toBe("pending");
  });
});
