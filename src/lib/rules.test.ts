import { describe, expect, it } from "vitest";
import { cardLine, importDays, shortDay, showsToRefresh, smartQuotes, watchedGroups, watchingShows, yourTake } from "./rules";
import type { Movie } from "./types";

describe("short day labels", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  it("fits a small label", () => {
    expect(shortDay(new Date(2026, 8, 29, 21, 0).getTime(), now)).toMatch(/9:00/);
    expect(shortDay(new Date(2026, 8, 29).getTime(), now, false)).toBe("Today");
    expect(shortDay(new Date(2026, 8, 30, 9, 0).getTime(), now)).toBe("Tomorrow");
    expect(shortDay(new Date(2026, 9, 2, 9, 0).getTime(), now)).toBe(new Date(2026, 9, 2).toLocaleDateString(undefined, { weekday: "short" }));
    expect(shortDay(new Date(2026, 9, 13, 9, 0).getTime(), now)).toBe(new Date(2026, 9, 13).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  });
});

describe("smart quotes", () => {
  it("curls apostrophes and quotes", () => {
    expect(smartQuotes("I can't beat it.")).toBe("I can\u2019t beat it.");
    expect(smartQuotes('He said "go" and the \'90s ended.')).toBe("He said \u201cgo\u201d and the \u201890s ended.");
    expect(smartQuotes("the boys' club")).toBe("the boys\u2019 club");
  });
});

describe("watching", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  const show = (id: string, fields: Partial<Movie>): Movie => ({ id, title: id, mediaType: "Show", tmdbType: "tv", tmdbId: id, createdAt: 1, ...fields });
  const movies: Movie[] = [
    show("slow-horses", { watched: true, watchedAt: 5, productionStatus: "Returning Series" }),
    show("lanterns", { personal: { episodes: ["1:1", "1:2"] }, productionStatus: "Returning Series", nextEpisode: { season: 1, episode: 3, airDate: "2026-10-02" } }),
    show("dark-matter", { personal: { status: "watching" }, productionStatus: "Returning Series", nextEpisode: { season: 2, episode: 1, airDate: "2026-11-20" } }),
    show("breaking-bad", { watched: true, productionStatus: "Ended" }),
    show("not-started", { productionStatus: "Returning Series" }),
    show("unknown", { watched: true, watchedAt: 9 }),
    { id: "film", title: "Film", mediaType: "Movie", tmdbType: "movie", watched: true }
  ];

  it("lists started shows that haven't ended, next episode first", () => {
    const entries = watchingShows(movies, now);
    expect(entries.map((entry) => entry.movie.id)).toEqual(["lanterns", "dark-matter", "slow-horses"]);
    expect(entries[0].detail).toBe("Next: S1 E3");
    expect(entries[1].detail).toBe("Season 2 premiere");
    expect(entries[2].label).toBe("Returning");
  });

  it("looks up started shows whose status is unknown or stale", () => {
    const stale = show("stale", { watched: true, productionStatus: "Returning Series", nextEpisode: { season: 3, episode: 2, airDate: "2026-09-01" } });
    expect(showsToRefresh([...movies, stale], now).map((movie) => movie.id)).toEqual(["unknown", "stale"]);
  });
});

describe("watched page", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 20).getTime();
  const seen = (id: string, fields: Partial<Movie>): Movie => ({ id, title: id, watched: true, createdAt: 1, ...fields });

  it("groups by month, newest first, with undated imports last", () => {
    const groups = watchedGroups([
      seen("a", { watchedAt: at(2026, 8, 3) }),
      seen("b", { watchedAt: at(2026, 8, 20) }),
      seen("c", { watchedAt: at(2025, 11, 25) }),
      seen("lb", { origin: "letterboxd", createdAt: at(2026, 8, 1), watchedAt: at(2026, 8, 1) + 1500 })
    ], now);
    expect(groups.map((group) => [group.key, group.movies.map((movie) => movie.id)])).toEqual([
      ["2026-8", ["b", "a"]], ["2025-11", ["c"]], ["undated", ["lb"]]
    ]);
    expect(groups[1].label).toMatch(/2025/);
    expect(groups[0].label).not.toMatch(/2026/);
  });

  it("puts a long Letterboxd import in its own group, not in the month it ran", () => {
    const day = at(2026, 8, 14);
    const imported = Array.from({ length: 45 }, (_, index) => seen(`lb${index}`, { origin: "letterboxd", createdAt: day + index * 5000, watchedAt: day + index * 5000 + 200000 }));
    const groups = watchedGroups([...imported, seen("real", { watchedAt: at(2026, 8, 20) })], now);
    expect(groups.map((group) => [group.key, group.movies.length])).toEqual([["2026-8", 1], ["undated", 45]]);
    expect(importDays(imported).size).toBe(1);
    // A handful of Letterboxd titles logged on one day is just a day of viewing.
    expect(importDays(imported.slice(0, 5)).size).toBe(0);
  });

  it("takes your own stars and heart over Letterboxd's", () => {
    expect(yourTake(seen("x", { letterboxd: { rating: 3.5, liked: true } }))).toEqual({ stars: 3.5, liked: true });
    expect(yourTake(seen("y", { personal: { rating: 5, liked: false }, letterboxd: { rating: 3, liked: true } }))).toEqual({ stars: 5, liked: false });
    expect(yourTake(seen("z", {}))).toEqual({ stars: 0, liked: false });
  });
});

describe("card line", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  const film = (fields: Partial<Movie>): Movie => ({ id: "f", title: "F", mediaType: "Movie", tmdbType: "movie", releaseDate: "2020-01-01", ...fields });
  it("says only what matters, in the rows' words", () => {
    expect(cardLine(film({}), now)).toBe("");
    expect(cardLine(film({ remindAt: now - 1000 }), now)).toBe("Due now");
    expect(cardLine(film({ remindAt: new Date(2026, 8, 29, 20, 0).getTime() }), now)).toBe("Due tonight");
    expect(cardLine(film({ remindAt: new Date(2026, 9, 1, 20, 0).getTime() }), now)).toMatch(/^Reminder \S+$/);
    expect(cardLine(film({ releaseDate: "2026-09-30" }), now)).toBe("Out tomorrow");
    expect(cardLine(film({ releaseDate: "2027-12-18" }), now)).toMatch(/^Out Dec 2027$/);
  });
});
