import { afterEach, describe, expect, it, vi } from "vitest";
import { browseStream, comingSoonReason, daysSinceRelease, hiddenGemReason, providerReason, providersFor, talkOfTheTownReason } from "./shelves";
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

describe("a streaming list when the title service fails", () => {
  afterEach(() => vi.unstubAllGlobals());
  const page = (results: unknown[]) => new Response(JSON.stringify({ results, total_pages: 1 }));
  const film = { id: 1, title: "A Film", poster_path: "/a.jpg", release_date: "2026-01-01", vote_average: 7 };

  it("reports the failure when every request fails, instead of an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(browseStream({ id: "free", label: "Free" }, "IN", "all")).rejects.toThrow(/Couldn't reach/);
  });

  it("keeps what loaded when only one kind fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("discover/movie") ? page([film]) : new Response("{}", { status: 500 }))));
    const { items } = await browseStream({ id: "free", label: "Free" }, "IN", "all");
    expect(items.map((item) => item.title)).toEqual(["A Film (2026)"]);
  });

  it("is a real empty list when the service answers with nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([])));
    expect((await browseStream({ id: "free", label: "Free" }, "IN", "all")).items).toEqual([]);
  });
});
