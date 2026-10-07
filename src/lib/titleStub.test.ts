import { describe, expect, it } from "vitest";
import { dayLabel, titleStub, type StubInput } from "./titleStub";
import type { Movie } from "./types";

const now = new Date(2026, 9, 7, 12, 0).getTime(); // Wed 7 October 2026, noon
const film = (extra: Partial<Movie> = {}): Movie => ({
  id: "m1", title: "Jailer 2 (2026)", year: "2026", mediaType: "Movie", tmdbType: "movie", tmdbId: "1234139",
  createdAt: new Date(2026, 9, 2, 10, 0).getTime(), updatedAt: now, ...extra
} as Movie);
const input = (extra: Partial<StubInput> = {}): StubInput => ({
  movie: film(), saved: true, show: false, unreleased: false, releaseDate: "", provider: null, upNext: "", length: "", now, ...extra
});
const values = (stub: ReturnType<typeof titleStub>) => Object.fromEntries(stub.fields.map((item) => [item.label, item.value]));

describe("titleStub", () => {
  it("offers Save for a film that isn't out and isn't saved", () => {
    const stub = titleStub(input({ saved: false, unreleased: true, releaseDate: "2026-10-15" }));
    expect(stub).toMatchObject({ tone: "orange", label: "Coming soon", primary: "save" });
    expect(values(stub)).toMatchObject({ Countdown: "In 8 days", "On your list": "Not yet", Where: "In cinemas" });
  });

  it("offers a reminder for a saved film that isn't out, and says whether one is set", () => {
    const off = titleStub(input({ unreleased: true, releaseDate: "2026-10-15" }));
    expect(off.primary).toBe("remind");
    expect(values(off).Reminder).toBe("Off");
    const on = titleStub(input({ movie: film({ remindAt: new Date(2026, 9, 15, 9, 0).getTime() }), unreleased: true, releaseDate: "2026-10-15" }));
    expect(values(on).Reminder).toMatch(/Oct 15/);
  });

  it("calls a show that hasn't started a premiere", () => {
    const stub = titleStub(input({ movie: film({ tmdbType: "tv", mediaType: "Show" }), show: true, saved: false, unreleased: true, releaseDate: "" }));
    expect(stub.label).toBe("Premieres soon");
    expect(values(stub)).toMatchObject({ Premieres: "Date not announced", Where: "To be announced" });
  });

  it("puts where it streams first in the queue and makes watching it the main button", () => {
    const stub = titleStub(input({
      movie: film({ tmdbType: "tv", mediaType: "Show", remindAt: new Date(2026, 9, 7, 21, 0).getTime() }),
      show: true, provider: { name: "Netflix", included: true }, upNext: "S1 E1"
    }));
    expect(stub).toMatchObject({ tone: "blue", label: "In your queue", primary: "watch" });
    expect(values(stub)).toMatchObject({ Reminder: expect.stringMatching(/^Today/), Where: "Netflix", "Up next": "S1 E1" });
  });

  it("makes Watched it the main button when nothing streams it", () => {
    const stub = titleStub(input({ length: "2h 10m" }));
    expect(stub.primary).toBe("watched");
    expect(values(stub)).toMatchObject({ Reminder: "None", Where: "Not streaming here", Runtime: "2h 10m" });
  });

  it("says Due now once the reminder has passed, and Watching for a show in progress", () => {
    expect(titleStub(input({ movie: film({ remindAt: now - 60_000 }) })).label).toBe("Due now");
    expect(titleStub(input({ movie: film({ tmdbType: "tv", mediaType: "Show", personal: { status: "watching" } }), show: true })).label).toBe("Watching");
  });

  it("shows a booked film's show, cinema, screen and seats, with the ticket as the main button", () => {
    const stub = titleStub(input({
      movie: film({ booking: { showAt: new Date(2026, 9, 15, 19, 30).getTime(), cinema: "PVR: Select Citywalk, Saket", screen: "Audi 5", seats: ["H12", "H13"], addedAt: now } }),
      unreleased: true, releaseDate: "2026-10-15"
    }));
    expect(stub).toMatchObject({ tone: "green", label: "Booked", primary: "ticket" });
    expect(values(stub)).toMatchObject({ Cinema: "PVR: Select Citywalk, Saket", Screen: "Audi 5", Seats: "H12, H13" });
    expect(values(stub).Show).toMatch(/7:30/);
  });

  it("leaves out booking details the ticket didn't have", () => {
    const stub = titleStub(input({ movie: film({ booking: { showAt: now + 86_400_000, addedAt: now } }) }));
    expect(stub.fields.map((item) => item.label)).toEqual(["Show"]);
  });

  it("shows when a title was watched and your verdict, and offers it again where it streams", () => {
    const stub = titleStub(input({
      movie: film({ watched: true, watchedAt: new Date(2026, 7, 20, 22, 0).getTime(), personal: { rating: 2.5, liked: true } }),
      provider: { name: "Prime Video", included: false }
    }));
    expect(stub).toMatchObject({ tone: "green", label: "Watched", primary: "watchAgain" });
    expect(values(stub)).toMatchObject({ When: "Aug 20", "Your take": "Timepass, liked", "Watch again": "Prime Video · rent or buy" });
  });

  it("has no main button for a watched title nothing streams", () => {
    const stub = titleStub(input({ movie: film({ watched: true }) }));
    expect(stub.primary).toBe("none");
    expect(values(stub)).toMatchObject({ When: "Date not known", "Your take": "Not rated yet" });
  });

  it("describes a released title that isn't saved", () => {
    const stub = titleStub(input({ movie: film({ rating: "7.9" }), saved: false, provider: { name: "Netflix", included: true }, releaseDate: "2024-03-07", length: "2 seasons" }));
    expect(stub).toMatchObject({ tone: "neutral", label: "Not on your list", primary: "save" });
    expect(values(stub)).toMatchObject({ Where: "Netflix", Runtime: "2 seasons", Rating: "7.9 / 10" });
    expect(values(stub).Out).toMatch(/2024/);
  });

  it("never shows more than four fields", () => {
    for (const stub of [
      titleStub(input({ saved: false, unreleased: true, releaseDate: "2026-10-15" })),
      titleStub(input({ movie: film({ watched: true, watchedAt: now }), provider: { name: "Netflix", included: true } })),
      titleStub(input({ movie: film({ rating: "7.1" }), saved: false, provider: { name: "Netflix", included: true }, releaseDate: "2020-01-01", length: "1h 40m" }))
    ]) expect(stub.fields.length).toBeLessThanOrEqual(4);
  });
});

describe("dayLabel", () => {
  it("counts days from today", () => {
    expect(dayLabel("2026-10-07", now)).toBe("today");
    expect(dayLabel("2026-10-08", now)).toBe("tomorrow");
    expect(dayLabel("2026-10-06", now)).toBe("yesterday");
    expect(dayLabel("2026-10-15", now)).toBe("in 8 days");
    expect(dayLabel("2026-10-01", now)).toBe("6 days ago");
  });
});
