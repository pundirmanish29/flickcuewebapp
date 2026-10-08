import { describe, expect, it } from "vitest";
import { formatCount, mergeRatings, missingRatingFields, parseMdbListRatings, savedRatings } from "./ratings";
import type { Movie } from "./types";

const mdblist = {
  ratings: [
    { source: "imdb", value: 8.04, votes: 328500 },
    { source: "tomatoes", value: 90, votes: 436 },
    { source: "popcorn", value: 97, votes: 25000 },
    { source: "metacritic", value: 74, votes: 50 }
  ]
};

describe("scores from MDBList", () => {
  it("reads the critics, audience and IMDb scores with their counts", () => {
    expect(parseMdbListRatings(mdblist)).toEqual({
      critic: { value: 90, count: 436 },
      audience: { value: 97, count: 25000 },
      imdb: { value: 8, count: 328500 }
    });
  });

  it("doesn't turn a score MDBList doesn't have (null) into 0%", () => {
    // One Piece's real answer: IMDb has a score, the Rotten Tomatoes ones are null.
    const onePiece = { ratings: [{ source: "imdb", value: 9.0, votes: 369641 }, { source: "tomatoes", value: null, votes: null }, { source: "popcorn", value: null, votes: null }] };
    expect(parseMdbListRatings(onePiece)).toEqual({ imdb: { value: 9, count: 369641 } });
    expect(parseMdbListRatings({ ratings: [{ source: "tomatoes", value: "" }, { source: "popcorn", value: undefined }] })).toEqual({});
    expect(savedRatings({ criticScore: null, audienceScore: "", imdbRating: null } as never)).toEqual({});
  });

  it("treats a stored 0% with nothing behind it as no score, but keeps a real one", () => {
    expect(savedRatings({ criticScore: 0, audienceScore: 0, imdbRating: 9 } as never)).toEqual({ imdb: { value: 9, count: undefined } });
    expect(savedRatings({ criticScore: 0, criticCount: 12 } as never)).toEqual({ critic: { value: 0, count: 12 } });
  });

  it("still shows a real 0%", () => {
    expect(parseMdbListRatings({ ratings: [{ source: "tomatoes", value: 0, votes: 12 }] })).toEqual({ critic: { value: 0, count: 12 } });
  });

  it("leaves out what's missing or out of range, and copes with nothing", () => {
    expect(parseMdbListRatings({ ratings: [{ source: "tomatoes", value: 140 }, { source: "imdb", value: null }, { source: "popcorn", value: 55 }] })).toEqual({ audience: { value: 55, count: undefined } });
    expect(parseMdbListRatings(null)).toEqual({});
    expect(parseMdbListRatings({ ratings: "x" })).toEqual({});
  });
});

describe("scores a saved title carries", () => {
  const movie = { id: "a", title: "A", criticScore: 91, audienceScore: 92, imdbRating: 8.1, criticCount: 300, imdbVotes: 120000 } as Movie;

  it("reads them, with the counts the extension stored", () => {
    expect(savedRatings(movie)).toEqual({ critic: { value: 91, count: 300 }, audience: { value: 92, count: undefined }, imdb: { value: 8.1, count: 120000 } });
    expect(savedRatings({ id: "b", title: "B" } as Movie)).toEqual({});
  });

  it("takes fresh scores first and fills a missing count from the title", () => {
    const merged = mergeRatings({ critic: { value: 90 }, imdb: { value: 8.0, count: 328500 } }, savedRatings(movie));
    expect(merged).toEqual({ critic: { value: 90, count: 300 }, audience: { value: 92, count: undefined }, imdb: { value: 8, count: 328500 } });
  });

  it("writes back only what the title lacks, never replacing a score", () => {
    const bare = { id: "c", title: "C", imdbRating: 7.5 } as Movie;
    expect(missingRatingFields(bare, parseMdbListRatings(mdblist))).toEqual({ criticScore: 90, criticCount: 436, audienceScore: 97, audienceCount: 25000 });
    expect(missingRatingFields(movie, parseMdbListRatings(mdblist))).toEqual({});
  });
});

describe("counts", () => {
  it("shortens them the way the reference does", () => {
    expect([436, 1500, 25000, 328500, 1200000, 999].map(formatCount)).toEqual(["436", "1.5K", "25K", "328.5K", "1.2M", "999"]);
  });
});

describe("asking for scores", () => {
  it("doesn't ask again for ten minutes once the title service has refused", async () => {
    const { fetchRatings } = await import("./ratings");
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { calls++; return new Response("{}", { status: 403 }); }) as typeof fetch;
    try {
      expect(await fetchRatings("movie", "9999001", 1_000)).toEqual({});
      expect(await fetchRatings("movie", "9999001", 2_000)).toEqual({});
      expect(calls).toBe(1);
      expect(await fetchRatings("movie", "9999001", 1_000 + 11 * 60 * 1000)).toEqual({});
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = real;
    }
  });
});
