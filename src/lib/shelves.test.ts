import { afterEach, describe, expect, it, vi } from "vitest";
import { browseAll, IN_CINEMAS } from "./tmdb";
import { browseNew, browseStream, comingSoonReason, daysSinceRelease, hiddenGemReason, providerReason, providersFor, talkOfTheTownReason } from "./shelves";
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

describe("every film in cinemas, and what's new", () => {
  afterEach(() => vi.unstubAllGlobals());
  const film = (id: number, extra: Record<string, unknown> = {}) => ({ id, title: `Film ${id}`, poster_path: `/p${id}.jpg`, release_date: "2026-09-20", vote_average: 7, ...extra });
  const show = (id: number) => ({ id, name: `Show ${id}`, poster_path: `/s${id}.jpg`, first_air_date: "2026-09-25", vote_average: 7 });
  const answer = (results: unknown[], totalPages = 1) => new Response(JSON.stringify({ results, total_pages: totalPages }));

  it("loads every page of a list, the first page on its own first", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      asked.push(`${new URL(url).searchParams.get("region")}:${page}`);
      return answer([film(page * 10), film(page * 10 + 1)], 3);
    }));
    const seen: string[][] = [];
    await browseAll(IN_CINEMAS, "IN", (items) => seen.push(items.map((item) => item.title)));
    expect(asked.sort()).toEqual(["IN:1", "IN:2", "IN:3"]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(["Film 10 (2026)", "Film 11 (2026)"]);
    expect(seen[1]).toHaveLength(6);
  });

  it("keeps the films it did get when a later page fails, and reports a failed first page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (new URL(url).searchParams.get("page") === "2" ? new Response("{}", { status: 500 }) : answer([film(1)], 2))));
    const seen: number[] = [];
    await browseAll(IN_CINEMAS, "IN", (items) => seen.push(items.length));
    expect(seen).toEqual([1, 1]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await expect(browseAll(IN_CINEMAS, "IN", () => {})).rejects.toThrow(/Title lookup failed/);
  });

  it("shows a film in cinemas that has no poster, as a blank cover", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([film(1), film(2, { poster_path: null })])));
    const seen: string[][] = [];
    await browseAll(IN_CINEMAS, "IN", (items) => seen.push(items.map((item) => item.title)));
    expect(seen[0]).toEqual(["Film 1 (2026)", "Film 2 (2026)"]);
  });

  it("lists what came out in the last 30 days, films and shows in turn, each labelled", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      return answer(String(url).includes("discover/tv") ? [show(1), show(2)] : [film(1), film(2)]);
    }));
    const { items } = await browseNew("all", 1, NOW);
    expect(items.map((item) => item.title)).toEqual(["Film 1 (2026)", "Show 1 (2026)", "Film 2 (2026)", "Show 2 (2026)"]);
    expect(items.map((item) => item.reason)).toEqual(["New Movie", "New Show", "New Movie", "New Show"]);
    const movie = new URL(urls.find((url) => url.includes("discover/movie"))!).searchParams;
    expect(movie.get("primary_release_date.gte")).toBe(isoDate(-30));
    expect(movie.get("primary_release_date.lte")).toBe(isoDate(0));
    const tv = new URL(urls.find((url) => url.includes("discover/tv"))!).searchParams;
    expect(tv.get("first_air_date.gte")).toBe(isoDate(-30));
    expect(tv.get("first_air_date.lte")).toBe(isoDate(0));
  });

  it("can ask for only films or only shows", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(String(url)); return answer([show(1)]); }));
    await browseNew("tv", 2, NOW);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("discover/tv");
    expect(new URL(urls[0]).searchParams.get("page")).toBe("2");
  });
});
