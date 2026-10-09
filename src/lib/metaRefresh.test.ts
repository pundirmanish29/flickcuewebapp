import { describe, expect, it } from "vitest";
import { freshFields, META_MAX_AGE, metaIsStale, staleTitles } from "./metaRefresh";
import type { TitleDetails } from "./tmdb";
import type { Movie } from "./types";

const now = new Date(2026, 9, 7, 12).getTime();
const DAY = 86_400_000;
const movie = (extra: Partial<Movie> = {}): Movie => ({ id: "m", title: "Arrival (2016)", tmdbType: "movie", tmdbId: "329865", ...extra });
const details = (extra: Partial<TitleDetails> = {}): TitleDetails => ({
  overview: "Taking place after alien crafts land around the world, an expert linguist is recruited by the military to determine whether they come in peace or are a threat.",
  tagline: "Why are they here?", genres: ["Drama", "Science Fiction"], runtimeMinutes: 116, status: "Released", imdbId: "tt2543164", rating: "7.6",
  backdrop: "https://image.tmdb.org/t/p/w1280/new-backdrop.jpg", poster: "https://image.tmdb.org/t/p/w500/new-poster.jpg", releaseDate: "2016-11-10",
  director: "Denis Villeneuve", cast: [], crew: [], seasons: [], streaming: [], rentOrBuy: [], watchLink: "", trailer: "", trailerKey: "", certification: "",
  episodeMinutes: 0, seasonCount: 0, episodeCount: 0, network: "", nextEpisode: null, lastEpisode: null, language: "", regionalRelease: "", recommendations: [],
  ...extra
});

describe("metaIsStale", () => {
  it("is due when it was never stamped or the stamp is older than 150 days", () => {
    expect(metaIsStale(movie(), now)).toBe(true);
    expect(metaIsStale(movie({ metaFetchedAt: now - META_MAX_AGE - DAY }), now)).toBe(true);
    expect(metaIsStale(movie({ metaFetchedAt: now - 149 * DAY }), now)).toBe(false);
  });

  it("leaves titles that hold no TMDB data alone", () => {
    expect(metaIsStale(movie({ tmdbId: undefined }), now)).toBe(false);
    expect(metaIsStale(movie({ tmdbId: "not-a-number" }), now)).toBe(false);
  });

  it("keeps the 150-day limit inside TMDB's six months", () => {
    expect(META_MAX_AGE).toBeLessThan(182 * DAY);
  });
});

describe("staleTitles", () => {
  it("puts titles still to watch first, then the longest unrefreshed", () => {
    const list = [
      movie({ id: "watched-old", watched: true, metaFetchedAt: 1 }),
      movie({ id: "queue-recent", metaFetchedAt: now - 200 * DAY }),
      movie({ id: "fresh", metaFetchedAt: now - DAY }),
      movie({ id: "queue-never" }),
      movie({ id: "by-hand", tmdbId: undefined })
    ];
    expect(staleTitles(list, now).map((item) => item.id)).toEqual(["queue-never", "queue-recent", "watched-old"]);
  });
});

describe("freshFields", () => {
  it("overwrites what TMDB supplied and stamps the fetch", () => {
    const fields = freshFields(movie({ rating: "7.4", runtimeMinutes: 110, tagline: "Old overview", genres: ["Drama"], releaseDate: "2016-11-11" }), details(), now);
    expect(fields).toMatchObject({ rating: "7.6", runtimeMinutes: 116, genres: ["Drama", "Science Fiction"], genre: "Drama", imdbId: "tt2543164", productionStatus: "Released", releaseDate: "2016-11-10", metaFetchedAt: now });
    expect(fields.tagline).toBe(details().overview.slice(0, 200));
  });

  it("keeps the backdrop already chosen, and adds one only where there's none", () => {
    expect(freshFields(movie({ backdrop: "https://image.tmdb.org/t/p/w1280/sharp.jpg" }), details(), now).backdrop).toBeUndefined();
    expect(freshFields(movie(), details(), now).backdrop).toBe(details().backdrop);
  });

  it("replaces a changed poster but not the same one at another size, nor one picked by hand", () => {
    expect(freshFields(movie({ poster: "https://image.tmdb.org/t/p/w185/old-poster.jpg" }), details(), now).poster).toBe(details().poster);
    expect(freshFields(movie({ poster: "https://image.tmdb.org/t/p/w185/new-poster.jpg" }), details(), now).poster).toBeUndefined();
    expect(freshFields(movie({ poster: "https://image.tmdb.org/t/p/w185/mine.jpg", posterLocked: true }), details(), now).poster).toBeUndefined();
  });

  it("leaves out what TMDB no longer has, so the stored value stays", () => {
    const fields = freshFields(movie({ rating: "7.4" }), details({ rating: "", overview: "", imdbId: "", genres: [], releaseDate: "" }), now);
    for (const key of ["rating", "tagline", "imdbId", "genres", "genre", "releaseDate"]) expect(fields[key]).toBeUndefined();
    expect(fields.metaFetchedAt).toBe(now);
  });
});
