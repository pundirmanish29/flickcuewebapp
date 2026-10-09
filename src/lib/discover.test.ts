import { describe, expect, it } from "vitest";
import { bestKnownWork, blendRecommendations, matchPerson, recommendationRows, normalizeQuery, pickSeeds, rankSearchResults, savedKeys, splitYear } from "./discover";
import type { Movie } from "./types";

const film = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, media_type: "movie", poster_path: `/p${id}.jpg`, vote_count: 100, popularity: 10, release_date: "2020-01-01", ...extra
});

describe("normalizeQuery", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeQuery("Amélie!")).toBe("amelie");
    expect(normalizeQuery("Fast & Furious")).toBe("fast and furious");
  });
});

describe("splitYear", () => {
  it("pulls a trailing year off the title", () => {
    expect(splitYear("dune 2021")).toEqual({ text: "dune", year: "2021" });
    expect(splitYear("Dune (1984)")).toEqual({ text: "Dune", year: "1984" });
  });
  it("leaves a title that is only a year alone", () => {
    expect(splitYear("1917")).toEqual({ text: "1917", year: "" });
  });
});

describe("rankSearchResults", () => {
  it("puts the well-known exact match above obscure namesakes", () => {
    const results = [
      film(1, "Dune", { vote_count: 3, popularity: 0.5 }),
      film(2, "Dune: Part Two", { vote_count: 6000, popularity: 200 }),
      film(3, "Dune", { vote_count: 12000, popularity: 150, release_date: "2021-09-15" })
    ];
    expect(rankSearchResults(results, "dune").map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it("prefers the title from the year typed", () => {
    const results = [
      film(3, "Dune", { vote_count: 12000, release_date: "2021-09-15" }),
      film(4, "Dune", { vote_count: 1500, release_date: "1984-12-14" })
    ];
    expect(rankSearchResults(results, "dune 1984")[0].id).toBe(4);
  });

  it("still matches titles that end in a number", () => {
    const results = [
      film(5, "Blade Runner", { vote_count: 14000, release_date: "1982-06-25" }),
      film(6, "Blade Runner 2049", { vote_count: 13000, release_date: "2017-10-04" })
    ];
    expect(rankSearchResults(results, "blade runner 2049")[0].id).toBe(6);
  });

  it("drops people and duplicate results", () => {
    const results = [film(1, "Heat"), { id: 9, name: "Heat Person", media_type: "person" }, film(1, "Heat")];
    expect(rankSearchResults(results, "heat")).toHaveLength(1);
  });
});

describe("matchPerson", () => {
  const person = { id: 7, name: "Greta Gerwig", media_type: "person", profile_path: "/g.jpg" };
  it("recognises a name search", () => {
    expect(matchPerson([film(1, "Barbie"), person], "greta gerwig")?.id).toBe(7);
  });
  it("ignores people when the query is a title", () => {
    expect(matchPerson([film(1, "Barbie"), person], "barbie")).toBeUndefined();
  });
});

describe("bestKnownWork", () => {
  it("lists an actor's biggest roles, without talk shows or cameos as themselves", () => {
    const credits = {
      cast: [
        { ...film(1, "Small"), vote_count: 40 },
        { ...film(2, "Big"), vote_count: 9000 },
        { ...film(3, "Late Show"), media_type: "tv", genre_ids: [10767], vote_count: 5000 },
        { ...film(4, "Documentary"), character: "Himself", vote_count: 800 },
        { ...film(5, "Unknown"), vote_count: 2 }
      ]
    };
    const result = bestKnownWork(credits);
    expect(result.work.map((item) => item.id)).toEqual([2, 1]);
    expect(result.role).toBe("Actor");
  });

  it("puts films someone directed alongside their roles, and says they do both", () => {
    const credits = {
      cast: [{ ...film(1, "Acted in"), vote_count: 3000 }, { ...film(4, "Also acted"), vote_count: 500 }],
      crew: [{ ...film(2, "Directed"), job: "Director", vote_count: 2500 }, { ...film(3, "Produced"), job: "Producer", vote_count: 9000 }]
    };
    const result = bestKnownWork(credits);
    expect(result.work.map((item) => item.id)).toEqual([2, 1, 4]);
    expect(result.role).toBe("Director & Actor");
  });

  it("still lists a newcomer's work when every credit has few votes", () => {
    const credits = {
      cast: [
        { ...film(1, "Few votes"), vote_count: 17 },
        { ...film(2, "Newest"), vote_count: 0, release_date: "2026-10-23" },
        { ...film(3, "Older"), vote_count: 0, release_date: "2019-05-01" },
        { ...film(4, "Late Show"), media_type: "tv", genre_ids: [10767], vote_count: 0 },
        { ...film(5, "No poster"), poster_path: null, vote_count: 0 }
      ]
    };
    const result = bestKnownWork(credits);
    expect(result.work.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(result.role).toBe("Actor");
  });

  it("keeps the vote cutoff whenever it leaves something to show", () => {
    const credits = { cast: [{ ...film(1, "Known"), vote_count: 40 }, { ...film(2, "Unseen"), vote_count: 0 }] };
    expect(bestKnownWork(credits).work.map((item) => item.id)).toEqual([1]);
  });
});

describe("recommendations", () => {
  const movies: Movie[] = [
    { id: "a", title: "Arrival (2016)", tmdbId: "329865", tmdbType: "movie", createdAt: 100 },
    { id: "b", title: "Severance (2022)", tmdbId: "95396", tmdbType: "tv", createdAt: 300 },
    { id: "c", title: "Typed by hand", createdAt: 400 },
    { id: "d", title: "Past Lives (2023)", tmdbId: "666277", tmdbType: "movie", createdAt: 50, watchedAt: 500 }
  ];

  it("seeds from the latest saves and watches that TMDB knows", () => {
    expect(pickSeeds(movies).map((seed) => seed.title)).toEqual(["Past Lives", "Severance", "Arrival"]);
    expect(pickSeeds(movies, 1)).toHaveLength(1);
  });

  it("ranks titles several saves agree on first, and skips what you already have", () => {
    const seeds = pickSeeds(movies);
    const blended = blendRecommendations([
      { seed: seeds[0], results: [film(10, "Only once"), film(20, "Shared")] },
      { seed: seeds[2], results: [film(20, "Shared"), film(329865, "Arrival")] }
    ], savedKeys(movies));
    expect(blended.map((entry) => entry.item.id)).toEqual([20, 10]);
    expect(blended[0].because).toBe("Arrival");
  });

  it("skips another version of a title you saved, and hand-added titles", () => {
    const seeds = pickSeeds(movies);
    const blended = blendRecommendations([
      { seed: seeds[1], results: [{ ...film(2316, "x"), title: undefined, name: "Severance", media_type: "tv" }, film(30, "Typed by Hand"), film(31, "New")] }
    ], savedKeys(movies));
    expect(blended.map((entry) => entry.item.id)).toEqual([31]);
  });
});

describe("person by surname", () => {
  it("takes the top result when the search is one of their names", () => {
    const nolan = { media_type: "person", id: 9, name: "Christopher Nolan", profile_path: "/n.jpg" };
    expect(matchPerson([nolan, { media_type: "movie", id: 2, title: "Facing Nolan" }], "nolan")?.id).toBe(9);
    expect(matchPerson([{ media_type: "movie", id: 2, title: "Facing Nolan" }, nolan], "nolan")).toBeUndefined();
    expect(matchPerson([nolan], "nol")).toBeUndefined();
  });
});

describe("recommendation rows", () => {
  const item = (id: number) => ({ id, title: `T${id}`, poster_path: "/p.jpg", media_type: "movie" });
  it("gives each save its own row, a title once, and drops thin rows", () => {
    const rows = recommendationRows([
      { seed: { tmdbId: "1", tmdbType: "tv", title: "One Piece" }, results: [1, 2, 3, 4, 5].map(item) },
      { seed: { tmdbId: "2", tmdbType: "movie", title: "Heat" }, results: [3, 4, 5, 6, 7, 8, 9].map(item) },
      { seed: { tmdbId: "3", tmdbType: "movie", title: "Thin" }, results: [1, 10].map(item) }
    ], new Set(["tmdb:movie:2"]));
    expect(rows.map((row) => [row.because, row.items.map((entry) => entry.item.id)])).toEqual([
      ["One Piece", [1, 3, 4, 5]],
      ["Heat", [6, 7, 8, 9]]
    ]);
  });
});
