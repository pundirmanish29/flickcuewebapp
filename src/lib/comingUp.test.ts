import { describe, expect, it } from "vitest";
import { COMING_UP_LIMIT, comingUp } from "./comingUp";
import type { Movie } from "./types";

const now = new Date(2026, 9, 7, 15, 0).getTime();
const HOUR = 3_600_000, DAY = 24 * HOUR;
const title = (id: string, extra: Partial<Movie> = {}): Movie => ({ id, title: id, createdAt: now - DAY, updatedAt: now, ...extra } as Movie);

describe("comingUp", () => {
  it("lists reminders in the coming week, soonest first", () => {
    const list = comingUp([
      title("later", { remindAt: now + 3 * DAY }),
      title("tonight", { remindAt: now + 6 * HOUR }),
      title("next month", { remindAt: now + 20 * DAY })
    ], now);
    expect(list.map((entry) => entry.movie.id)).toEqual(["tonight", "later"]);
    expect(list.every((entry) => entry.kind === "reminder")).toBe(true);
  });

  it("leaves out reminders that have passed and titles already watched", () => {
    expect(comingUp([title("past", { remindAt: now - HOUR }), title("seen", { remindAt: now + HOUR, watched: true })], now)).toEqual([]);
  });

  it("shows a booked film once, at its showtime, even with the reminder its ticket set", () => {
    const showAt = now + 8 * DAY;
    const list = comingUp([title("booked", { remindAt: showAt - HOUR, booking: { showAt, addedAt: now } })], now);
    expect(list).toEqual([expect.objectContaining({ kind: "booking", at: showAt })]);
  });

  it("drops a show that has started", () => {
    expect(comingUp([title("started", { runtimeMinutes: 150, booking: { showAt: now - HOUR, addedAt: now - DAY } })], now)).toEqual([]);
  });

  it("keeps the list short", () => {
    const many = Array.from({ length: 12 }, (_, index) => title(`t${index}`, { remindAt: now + (index + 1) * HOUR }));
    expect(comingUp(many, now)).toHaveLength(COMING_UP_LIMIT);
  });
});
