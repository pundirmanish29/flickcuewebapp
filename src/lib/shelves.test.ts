import { afterEach, describe, expect, it, vi } from "vitest";
import { browseAll, IN_CINEMAS } from "./tmdb";
import { browseNew, browseStream, COMING_SOON, comingSoonReason, daysSinceRelease, featuredCinemaItems, hiddenGemReason, providerReason, providersFor, talkOfTheTownReason } from "./shelves";
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

describe("featured cinema cards", () => {
  const pick = (id: string, extra: Partial<Candidate> = {}) => title({ key: id, title: id, poster: "/poster.jpg", popularity: 20, voteCount: 100, ...extra });

  it("keeps popular unrated upcoming films in date order, excluding obscure and posterless films", () => {
    const items = [
      pick("later", { releaseDate: isoDate(20), popularity: 40, voteCount: 0 }),
      pick("obscure", { releaseDate: isoDate(1), popularity: 0.5 }),
      pick("earlier", { releaseDate: isoDate(5), popularity: 10, voteCount: 0 }),
      pick("no-poster", { releaseDate: isoDate(2), popularity: 100, poster: "" }),
      pick("undated", { releaseDate: "", popularity: 8, voteCount: 0 })
    ];
    expect(featuredCinemaItems(items, "soon", NOW).map((item) => item.key)).toEqual(["earlier", "later", "undated"]);
    expect(items[0].key).toBe("later");
  });

  it("selects the strongest twelve upcoming films before applying the release-date order", () => {
    const items = Array.from({ length: 13 }, (_, index) => pick(String(index), { popularity: 3 + index, releaseDate: isoDate(index + 1) }));
    expect(featuredCinemaItems(items, "soon", NOW).map((item) => item.key)).toEqual(items.slice(1).map((item) => item.key));
  });

  it("requires released titles to have audience engagement, allowing high interest in the first two weeks", () => {
    const items = [
      pick("established", { releaseDate: isoDate(-30), popularity: 10, voteCount: 50 }),
      pick("too-few-votes", { releaseDate: isoDate(-30), popularity: 10, voteCount: 49 }),
      pick("fresh", { releaseDate: isoDate(-14), popularity: 30, voteCount: 0 }),
      pick("old-unrated", { releaseDate: isoDate(-15), popularity: 100, voteCount: 0 }),
      pick("fresh-low-interest", { releaseDate: isoDate(-1), popularity: 29, voteCount: 0 }),
      pick("future-unrated", { releaseDate: isoDate(1), popularity: 100, voteCount: 0 }),
      pick("no-poster", { poster: "", popularity: 100 }),
      pick("missing-signals", { popularity: undefined, voteCount: undefined })
    ];
    expect(featuredCinemaItems(items, "now", NOW).map((item) => item.key)).toEqual(["fresh", "established"]);
  });

  it("keeps new movies and shows mixed, with an audience threshold appropriate to each", () => {
    const movies = Array.from({ length: 14 }, (_, index) => pick(`movie-${index}`, { popularity: 100 - index, releaseDate: isoDate(-25) }));
    const shows = [
      pick("show", { tmdbType: "tv", popularity: 20, voteCount: 20, releaseDate: isoDate(-25) }),
      pick("small-show", { tmdbType: "tv", popularity: 20, voteCount: 19, releaseDate: isoDate(-25) })
    ];
    const featured = featuredCinemaItems([...movies, ...shows], "new", NOW);
    expect(featured).toHaveLength(12);
    expect(featured.slice(0, 3).map((item) => item.key)).toEqual(["movie-0", "show", "movie-1"]);
    expect(featured.some((item) => item.key === "small-show")).toBe(false);
    expect(featuredCinemaItems([pick("obscure", { popularity: 1 })], "new", NOW)).toEqual([]);
  });
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

  it("labels recent releases without claiming when they joined a service", () => {
    expect(providerReason(title({ releaseDate: isoDate(-30) }), "Netflix", NOW)).toBe("New Movie · Netflix");
    expect(providerReason(title({ tmdbType: "tv", releaseDate: isoDate(-90) }), "Netflix", NOW)).toBe("New Show · Netflix");
    expect(providerReason(title({ releaseDate: isoDate(-91) }), "Netflix", NOW)).toBe("");
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
  const film = { id: 1, title: "A Film", media_type: "movie", poster_path: "/a.jpg", release_date: "2026-09-20", vote_average: 7 };

  it("reports the failure when every request fails, instead of an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(browseStream({ id: "free", label: "Free" }, "IN", "all")).rejects.toThrow(/Couldn't reach/);
  });

  it("keeps what loaded when only one kind fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("discover/movie") ? page([film]) : new Response("{}", { status: 500 }))));
    const { items } = await browseStream({ id: "free", label: "Free" }, "IN", "all", 1, NOW);
    expect(items.map((item) => item.title)).toEqual(["A Film (2026)"]);
  });

  it("is a real empty list when the service answers with nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([])));
    expect((await browseStream({ id: "free", label: "Free" }, "IN", "all")).items).toEqual([]);
  });
});

describe("new and trending streaming titles", () => {
  afterEach(() => vi.unstubAllGlobals());
  const film = (id: number, days: number, extra: Record<string, unknown> = {}) => ({ id, title: `Film ${id}`, media_type: "movie", poster_path: `/p${id}.jpg`, release_date: isoDate(days), ...extra });
  const show = (id: number, days: number) => ({ id, name: `Show ${id}`, media_type: "tv", poster_path: `/s${id}.jpg`, first_air_date: isoDate(days) });
  const answer = (results: unknown[], pages = 1) => new Response(JSON.stringify({ results, total_pages: pages }));

  it.each([
    { id: "8", label: "Netflix" }, { id: "119", label: "Prime Video" },
    { id: "2336", label: "JioHotstar" }, { id: "350", label: "Apple TV" }, { id: "free", label: "Free" }
  ])("keeps only new releases and actual weekly trends for $label", async choice => {
    const urls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const parsed = new URL(url); urls.push(parsed);
      // A global trend on another service is never introduced into this provider's results.
      if (parsed.pathname.includes("trending/")) return answer([film(2, -900), show(2, -1500), film(99, -30), film(4, 5)]);
      // Even faulty upstream date filtering must not admit an unreleased or older non-trending title.
      if (parsed.pathname.includes("discover/movie")) return answer([film(1, -3, { vote_count: 0 }), film(2, -900), film(3, -500), film(4, 5)]);
      return answer([show(1, -1), show(2, -1500), show(3, -600)]);
    }));
    const { items } = await browseStream(choice, "IN", "all", 1, NOW);
    expect(items.map(item => item.key).sort()).toEqual(["tmdb:movie:1", "tmdb:movie:2", "tmdb:tv:1", "tmdb:tv:2"]);
    expect(items.find(item => item.key === "tmdb:movie:1")?.reason).toMatch(/^New Movie · /);
    expect(items.find(item => item.key === "tmdb:tv:1")?.reason).toMatch(/^New Show · /);
    expect(items.find(item => item.key === "tmdb:movie:2")?.reason).toMatch(/^Trending Movie · /);
    expect(items.find(item => item.key === "tmdb:tv:2")?.reason).toMatch(/^Trending Show · /);
    const discover = urls.filter(url => url.pathname.includes("discover/"));
    for (const url of discover) {
      expect(url.searchParams.get("watch_region")).toBe("IN");
      expect(url.searchParams.get("with_watch_monetization_types")).toBe(choice.id === "free" ? "free|ads" : "flatrate");
      expect(url.searchParams.get("with_watch_providers")).toBe(choice.id === "free" ? null : choice.id);
      expect(url.searchParams.has("vote_count.gte")).toBe(false);
      expect(url.searchParams.has("vote_average.gte")).toBe(false);
    }
    expect(discover.find(url => url.pathname.includes("movie") && url.searchParams.has("primary_release_date.gte"))?.searchParams.get("primary_release_date.gte")).toBe(isoDate(-90));
    expect(discover.find(url => url.pathname.includes("tv") && url.searchParams.has("first_air_date.gte"))?.searchParams.get("first_air_date.gte")).toBe(isoDate(-90));
  });

  it("supports kind filters and provider pagination without duplicating either source", async () => {
    const urls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { const parsed = new URL(url); urls.push(parsed); return answer([show(1, -5)], 3); }));
    const result = await browseStream({ id: "8", label: "Netflix" }, "US", "tv", 2, NOW);
    expect(result.items.map(item => item.key)).toEqual(["tmdb:tv:1"]);
    expect(result.more).toBe(true);
    expect(urls.every(url => !url.pathname.includes("movie"))).toBe(true);
    expect(urls.filter(url => url.pathname.includes("discover/")).every(url => url.searchParams.get("page") === "2")).toBe(true);
    expect(urls.filter(url => url.pathname.includes("trending/")).map(url => url.searchParams.get("page"))).toEqual(["1", "2", "3"]);
  });

  it("retains new releases if trending cannot be checked, without filling with old catalogue titles", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("trending/")
      ? new Response("{}", { status: 500 }) : answer([film(1, -5), film(2, -500)])));
    const { items } = await browseStream({ id: "8", label: "Netflix" }, "IN", "movie", 1, NOW);
    expect(items.map(item => item.key)).toEqual(["tmdb:movie:1"]);
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

  it("orders coming soon by release date across pages, keeping ties stable and undated films last", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => answer(
      new URL(url).searchParams.get("page") === "1"
        ? [film(1, { release_date: "2026-12-20", popularity: 40, vote_count: 123 }), film(2, { release_date: "" }), film(3, { release_date: "2026-10-16" })]
        : [film(4, { release_date: "2026-10-12" }), film(5, { release_date: "2026-10-16" }), film(6, { release_date: null })],
      2
    )));
    const seen: string[][] = [];
    await browseAll(COMING_SOON, "IN", (items) => seen.push(items.map((item) => item.tmdbId)));
    expect(seen).toEqual([["3", "1", "2"], ["4", "3", "5", "1", "2", "6"]]);
  });

  it("retains audience signals without filtering low-interest and posterless titles out of the full list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([
      film(1, { popularity: 40, vote_count: 123 }),
      film(2, { popularity: 0.5, vote_count: 0, poster_path: null })
    ])));
    let loaded: Candidate[] = [];
    await browseAll(COMING_SOON, "IN", (items) => { loaded = items; });
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ popularity: 40, voteCount: 123 });
    expect(loaded[1]).toMatchObject({ popularity: 0.5, voteCount: 0, poster: "" });
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
