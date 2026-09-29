import { describe, expect, it } from "vitest";
import { shortDay, showsToRefresh, smartQuotes, watchingShows } from "./rules";
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
