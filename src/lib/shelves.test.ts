import { describe, expect, it } from "vitest";
import { comingSoonReason, daysSinceRelease, hiddenGemReason, providerReason, providersFor, talkOfTheTownReason } from "./shelves";
import type { Candidate } from "./types";

const NOW = new Date(2026, 8, 30, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const isoDate = (days: number) => {
  const date = new Date(NOW + days * DAY);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const title = (extra: Partial<Candidate> = {}): Candidate => ({
  key: "tmdb:movie:1", title: "A", year: "2026", mediaType: "Movie", tmdbType: "movie", tmdbId: "1", releaseDate: isoDate(-10),
  overview: "", rating: "7.4", poster: "", backdrop: "", upcoming: false, ...extra
});

describe("shelf reasons", () => {
  it("counts days from a release date", () => {
    expect(daysSinceRelease(isoDate(-10), NOW)).toBe(10);
    expect(daysSinceRelease(isoDate(3), NOW)).toBe(-3);
    expect(daysSinceRelease("", NOW)).toBeNull();
  });

  it("says what's new in the talk of the town", () => {
    expect(talkOfTheTownReason(title(), NOW)).toBe("New Movie");
    expect(talkOfTheTownReason(title({ tmdbType: "tv", mediaType: "Show", releaseDate: isoDate(-100) }), NOW)).toBe("New Show");
    expect(talkOfTheTownReason(title({ releaseDate: isoDate(-400) }), NOW)).toBe("Trending Movie");
    expect(talkOfTheTownReason(title({ tmdbType: "tv", mediaType: "Show", releaseDate: isoDate(-900) }), NOW)).toBe("Trending Show");
    expect(talkOfTheTownReason(title({ releaseDate: isoDate(5) }), NOW)).toMatch(/^Releases /);
  });

  it("gives coming-soon titles their date, or says it isn't known", () => {
    expect(comingSoonReason(title({ releaseDate: isoDate(9) }))).toMatch(/^Releases /);
    expect(comingSoonReason(title({ releaseDate: "" }))).toBe("Date to be announced");
  });

  it("names a hidden gem's rating", () => {
    expect(hiddenGemReason(title())).toBe("Hidden gem · rated 7.4");
    expect(hiddenGemReason(title({ rating: "" }))).toBe("Hidden gem");
  });

  it("marks only recent titles as new on a service", () => {
    expect(providerReason(title({ releaseDate: isoDate(-30) }), "Netflix", NOW)).toBe("New on Netflix");
    expect(providerReason(title({ releaseDate: isoDate(-300) }), "Netflix", NOW)).toBe("");
    expect(providerReason(title({ releaseDate: isoDate(4) }), "Netflix", NOW)).toBe("");
  });

  it("uses JioHotstar in India and Disney+ elsewhere", () => {
    expect(providersFor("IN").map((item) => item.name)).toContain("JioHotstar");
    expect(providersFor("US").map((item) => item.name)).toContain("Disney+");
    expect(providersFor("US").map((item) => item.name)).not.toContain("JioHotstar");
  });
});
