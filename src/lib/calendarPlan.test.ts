import { describe, expect, it } from "vitest";
import { desiredEvents, eventBody, eventIdFor, parseEventId, planCalendar, type DesiredEvent, type ExistingEvent } from "./calendarPlan";
import type { LibraryDocument, Movie } from "./types";

const NOW = new Date(2026, 8, 24, 15, 0).getTime();
const HOUR = 3_600_000;
const UUID = "3f2b8c1e-9a4d-4e7b-8c3a-1d2e3f4a5b6c";

const movie = (over: Partial<Movie> & { id: string }): Movie => ({ title: "Dune", year: "2021", mediaType: "Movie", tmdbType: "movie", watched: false, updatedAt: 1, createdAt: 1, ...over });
const library = (movies: Movie[], deleted: LibraryDocument["deleted"] = []): LibraryDocument => ({ movies, deleted });

describe("event ids", () => {
  it("only use the characters Google allows, and fit its length", () => {
    for (const id of [UUID, "abc-123", "ID WITH SPACES/and?symbols", "千と千尋", "A".repeat(300)]) {
      const made = eventIdFor(id, NOW + HOUR)!;
      expect(made).toMatch(/^[a-v0-9]+$/);
      expect(made.length).toBeGreaterThanOrEqual(5);
      expect(made.length).toBeLessThanOrEqual(1024);
    }
  });

  it("read back to the movie and the minute for a UUID, an arbitrary id and a unicode id", () => {
    for (const id of [UUID, "tt0816692", "Heat (1995) / director's cut", "もののけ姫"]) {
      const made = eventIdFor(id, NOW + 5 * HOUR)!;
      expect(parseEventId(made)).toEqual({ movieId: id, minute: Math.floor((NOW + 5 * HOUR) / 60000) });
    }
  });

  it("treat an uppercase UUID as an arbitrary id so it reads back exactly", () => {
    const upper = UUID.toUpperCase();
    expect(parseEventId(eventIdFor(upper, NOW + HOUR)!)?.movieId).toBe(upper);
  });

  it("are stable within a minute and change with the minute", () => {
    const base = NOW + HOUR - (NOW % 60000);
    expect(eventIdFor(UUID, base + 5_000)).toBe(eventIdFor(UUID, base + 55_000));
    expect(eventIdFor(UUID, base)).not.toBe(eventIdFor(UUID, base + 60_000));
    expect(eventIdFor("one", base)).not.toBe(eventIdFor("two", base));
  });

  it("are refused when they could not be made safely", () => {
    expect(eventIdFor("", NOW)).toBeNull();
    expect(eventIdFor(UUID, 0)).toBeNull();
    expect(eventIdFor(UUID, Number.NaN)).toBeNull();
    expect(eventIdFor(UUID, -5)).toBeNull();
    expect(eventIdFor("x".repeat(500), NOW)).toBeNull();
  });

  it("are not read for events that aren't ours", () => {
    expect(parseEventId("somethingelse")).toBeNull();
    expect(parseEventId("fc")).toBeNull();
    expect(parseEventId("fc00000000hzzzz")).toBeNull();
    expect(parseEventId(`${eventIdFor(UUID, NOW + HOUR)!}x`)).toBeNull();
  });
});

describe("desiredEvents", () => {
  it("is a reminder still to come, on a title not watched", () => {
    const events = desiredEvents(library([
      movie({ id: "a", remindAt: NOW + HOUR }),
      movie({ id: "past", remindAt: NOW - HOUR }),
      movie({ id: "none" }),
      movie({ id: "null", remindAt: null }),
      movie({ id: "watched", remindAt: NOW + HOUR, watched: true })
    ]), NOW);
    expect(events.map((event) => event.movieId)).toEqual(["a"]);
  });

  it("leaves out reminders that are not real times", () => {
    const events = desiredEvents(library([
      movie({ id: "nan", remindAt: Number.NaN }), movie({ id: "neg", remindAt: -1 }), movie({ id: "str", remindAt: "soon" as unknown as number })
    ]), NOW);
    expect(events).toEqual([]);
  });

  it("leaves out a title that was removed after its last edit", () => {
    const events = desiredEvents(library([movie({ id: "gone", remindAt: NOW + HOUR, updatedAt: 5 })], [{ id: "gone", deletedAt: 9 }]), NOW);
    expect(events).toEqual([]);
  });

  it("keeps a title that was brought back after it was removed", () => {
    const events = desiredEvents(library([movie({ id: "back", remindAt: NOW + HOUR, updatedAt: 20 })], [{ id: "back", deletedAt: 9 }]), NOW);
    expect(events).toHaveLength(1);
  });

  it("says 'Out today' on the release day and 'Watch' otherwise", () => {
    const tonight = new Date(2026, 8, 25, 20, 0).getTime();
    const [out] = desiredEvents(library([movie({ id: "r", title: "Dune: Part Three", remindAt: tonight, releaseDate: "2026-09-25" })]), NOW);
    const [watch] = desiredEvents(library([movie({ id: "w", title: "Dune: Part Three", remindAt: tonight, releaseDate: "2026-12-18" })]), NOW);
    expect(out.summary).toBe("Out today: Dune: Part Three");
    expect(watch.summary).toBe("Watch: Dune: Part Three");
  });

  it("clamps the length and defaults it for films and shows", () => {
    const at = NOW + HOUR;
    const hours = (event: DesiredEvent) => (event.endMs - event.startMs) / 60000;
    const [film] = desiredEvents(library([movie({ id: "f", remindAt: at })]), NOW);
    const [show] = desiredEvents(library([movie({ id: "s", remindAt: at, mediaType: "Show", tmdbType: "tv" })]), NOW);
    const [short] = desiredEvents(library([movie({ id: "sh", remindAt: at, runtimeMinutes: 8 })]), NOW);
    const [long] = desiredEvents(library([movie({ id: "lg", remindAt: at, runtimeMinutes: 600 })]), NOW);
    const [exact] = desiredEvents(library([movie({ id: "ex", remindAt: at, runtimeMinutes: 100 })]), NOW);
    expect([hours(film), hours(show), hours(short), hours(long), hours(exact)]).toEqual([120, 45, 30, 240, 100]);
  });

  it("is plain text, with the title cleaned and a link back to the title", () => {
    const [event] = desiredEvents(library([movie({ id: "x y", title: "<b>Heat</b>   (1995)", remindAt: NOW + HOUR, year: "1995" })]), NOW, "https://flickcue.in");
    expect(event.summary).toBe("Watch: bHeat/b");
    expect(event.description).toContain("https://flickcue.in/#/title/x%20y");
    expect(event.description).not.toMatch(/[<>]/);
    const long = desiredEvents(library([movie({ id: "l", title: "T".repeat(500), remindAt: NOW + HOUR })]), NOW)[0];
    expect(long.summary.length).toBe(200);
  });

  it("makes one event per title and reminder", () => {
    const events = desiredEvents(library([movie({ id: "a", remindAt: NOW + HOUR }), movie({ id: "a", remindAt: NOW + HOUR })]), NOW);
    expect(events).toHaveLength(1);
  });
});

describe("planCalendar", () => {
  const make = (id: string, at: number) => desiredEvents(library([movie({ id, remindAt: at })]), NOW)[0];
  const A = make("a", NOW + HOUR);
  const B = make("b", NOW + 2 * HOUR);
  const on = (event: DesiredEvent, status: ExistingEvent["status"] = "confirmed"): ExistingEvent => ({ id: event.id, status });

  it("creates what is missing", () => {
    expect(planCalendar([A, B], [on(A)], {}, NOW).ops).toEqual([{ type: "create", event: B }]);
  });

  it("leaves an id alone in any state, so a deleted event stays deleted", () => {
    expect(planCalendar([A], [on(A, "cancelled")], {}, NOW).ops).toEqual([]);
    expect(planCalendar([A], [on(A, "tentative")], {}, NOW).ops).toEqual([]);
  });

  it("brings back an event this device deleted itself, when it is wanted again", () => {
    const plan = planCalendar([A], [on(A, "cancelled")], { deletedByUs: new Set([A.id]) }, NOW);
    expect(plan.ops).toEqual([{ type: "revive", event: A }]);
  });

  it("deletes the old event when the reminder changed, and creates the new one", () => {
    const moved = make("a", NOW + 3 * HOUR);
    const plan = planCalendar([moved], [on(A)], {}, NOW);
    expect(plan.ops).toEqual([{ type: "delete", id: A.id }, { type: "create", event: moved }]);
  });

  it("deletes the event of a title that is no longer wanted (watched, removed, cleared)", () => {
    expect(planCalendar([], [on(A)], {}, NOW).ops).toEqual([{ type: "delete", id: A.id }]);
  });

  it("never deletes an event whose reminder time has passed", () => {
    const old = eventIdFor("old", NOW - HOUR)!;
    expect(planCalendar([], [{ id: old, status: "confirmed" }], {}, NOW).ops).toEqual([]);
  });

  it("does not touch an already-cancelled event, or one that isn't ours", () => {
    expect(planCalendar([], [on(A, "cancelled"), { id: "birthdayparty", status: "confirmed" }], {}, NOW).ops).toEqual([]);
  });

  it("removes the event of a title merged into another, whose id no longer exists", () => {
    const survivor = make("kept", NOW + HOUR);
    const plan = planCalendar([survivor], [on(make("merged-away", NOW + HOUR))], {}, NOW);
    expect(plan.ops.map((op) => op.type)).toEqual(["delete", "create"]);
  });

  it("holds a mass delete, and goes ahead when it is allowed", () => {
    const many = Array.from({ length: 12 }, (_, i) => make(`m${i}`, NOW + (i + 1) * HOUR));
    const existing = many.map((event) => on(event));
    const held = planCalendar([], existing, {}, NOW);
    expect(held).toMatchObject({ held: true, deletes: 12, remaining: 0, ops: [] });
    const allowed = planCalendar([], existing, { allowBulkDelete: true }, NOW);
    expect(allowed.held).toBe(false);
    expect(allowed.ops).toHaveLength(12);
  });

  it("still creates while a mass delete is held, and allows a few deletes without a hold", () => {
    const few = Array.from({ length: 4 }, (_, i) => make(`f${i}`, NOW + (i + 1) * HOUR));
    expect(planCalendar([], few.map((event) => on(event)), {}, NOW)).toMatchObject({ held: false, deletes: 4 });
    const many = Array.from({ length: 12 }, (_, i) => make(`m${i}`, NOW + (i + 1) * HOUR));
    const plan = planCalendar([A], many.map((event) => on(event)), {}, NOW);
    expect(plan.held).toBe(true);
    expect(plan.ops).toEqual([{ type: "create", event: A }]);
  });

  it("caps the work per run and says how much is left", () => {
    const events = Array.from({ length: 30 }, (_, i) => make(`c${i}`, NOW + (i + 1) * HOUR));
    const plan = planCalendar(events, [], { maxOps: 25 }, NOW);
    expect(plan.ops).toHaveLength(25);
    expect(plan.remaining).toBe(5);
  });

  it("plans nothing once its own result is on the calendar", () => {
    const first = planCalendar([A, B], [], {}, NOW);
    const after = first.ops.flatMap((op) => (op.type === "create" ? [on(op.event)] : []));
    expect(planCalendar([A, B], after, {}, NOW).ops).toEqual([]);
  });
});

describe("eventBody", () => {
  it("is a timed event that shows as free and pops up once, at the reminder time", () => {
    const [event] = desiredEvents(library([movie({ id: UUID, remindAt: NOW + HOUR })]), NOW);
    const body = eventBody(event, "Asia/Kolkata") as any;
    expect(body.id).toBe(event.id);
    expect(body.start).toEqual({ dateTime: new Date(event.startMs).toISOString(), timeZone: "Asia/Kolkata" });
    expect(body.end.dateTime).toBe(new Date(event.endMs).toISOString());
    expect(body.transparency).toBe("transparent");
    expect(body.reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 0 }] });
    expect(body.source).toEqual({ title: "FlickCue", url: event.url });
    expect(body.start.date).toBeUndefined();
  });
});
