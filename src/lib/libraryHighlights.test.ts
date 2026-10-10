import { describe, expect, it } from "vitest";
import { queuedFilms, shuffled, sourceReview, sourceReviews, highlightRating, watchedHighlights } from "./libraryHighlights";
import type { Movie } from "./types";

const film = (id: string, extra: Partial<Movie> = {}): Movie => ({ id, title: `Film ${id}`, tmdbId: id, tmdbType: "movie", ...extra });

describe("queue movie picks", () => {
  it("uses only saved unwatched films, keeping manual saves and excluding upcoming films", () => {
    const items = [film("1"), film("2", { watched: true }), film("3", { tmdbType: "tv" }), film("manual", { tmdbId: undefined }), film("soon", { upcoming: true })];
    expect(queuedFilms(items).map(movie => movie.id)).toEqual(["1", "manual"]);
    expect(items[0].createdAt).toBeUndefined();
  });
  it("uses the release date over stale upcoming flags and includes release day", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    const items = [
      film("future", { releaseDate: "2026-12-16", upcoming: false }),
      film("today", { releaseDate: "2026-10-10", upcoming: true }),
      film("past", { releaseDate: "2026-10-09", upcoming: true }),
      film("undated-upcoming", { upcoming: true })
    ];
    expect(queuedFilms(items, now).map(movie => movie.id)).toEqual(["today", "past"]);
    expect(queuedFilms(items, Date.parse("2026-12-16T12:00:00Z")).map(movie => movie.id)).toEqual(["future", "today", "past"]);
  });
  it("keeps the entire queue available and never changes its saved order", () => {
    const items = Array.from({ length: 10 }, (_, i) => film(String(i + 1), { createdAt: i + 1 }));
    const before = structuredClone(items);
    expect(shuffled(queuedFilms(items), () => 0).map(movie => movie.id)).toEqual(["2", "3", "4", "5", "6", "7", "8", "9", "10", "1"]);
    expect(items).toEqual(before);
    expect(queuedFilms([])).toEqual([]);
  });
  it("shuffles a copy and preserves every candidate", () => {
    const items = ["a", "b", "c", "d"];
    const mixed = shuffled(items, () => 0);
    expect(mixed).not.toEqual(items);
    expect([...mixed].sort()).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });
});

describe("watched highlights", () => {
  const items = [
    film("1", { watched: true, personal: { rating: 2, review: "Own review" }, letterboxd: { rating: 5, review: "Imported review" } }),
    film("2", { watched: true, personal: { rating: 4.5 }, letterboxd: { rating: 1 } }),
    film("3", { personal: { rating: 5 } }),
    film("4", { watched: true, rating: "10", criticScore: 100 }),
    film("5", { watched: true, personal: { review: "  Review without stars  " } }),
    film("6", { watched: true, personal: { review: "  " } })
  ];
  it("combines both sources once per film, ranking by the highest personal rating", () => {
    expect(watchedHighlights(items, "rated").map(movie => movie.id)).toEqual(["1", "2"]);
    expect(highlightRating(items[0])).toBe(5);
    expect(items[0].personal?.rating).toBe(2);
    expect((items[0].letterboxd as { rating: number }).rating).toBe(5);
    expect(items.map(movie => movie.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
  it("includes reviews without stars, skips blank reviews, and keeps their sources distinct", () => {
    expect(watchedHighlights(items, "reviewed").map(movie => movie.id)).toEqual(["1", "5"]);
    expect(sourceReviews(items[0])).toEqual([{ source: "flickcue", text: "Own review" }, { source: "letterboxd", text: "Imported review" }]);
    expect(sourceReview(items[0], "flickcue")).toBe("Own review");
    expect(sourceReview(items[0], "letterboxd")).toBe("Imported review");
    expect(sourceReview(items[4], "flickcue")).toBe("Review without stars");
  });
  it("breaks equal ratings by viewing date and handles malformed imported data", () => {
    expect(watchedHighlights([film("1", { watched: true, watchedAt: 1, letterboxd: { rating: 4 } }), film("2", { watched: true, watchedAt: 2, personal: { rating: 4 } }), film("3", { watched: true, letterboxd: { rating: Infinity, review: {} } })], "rated").map(movie => movie.id)).toEqual(["2", "1"]);
    expect(sourceReview(film("bad", { letterboxd: { review: {} } }), "letterboxd")).toBe("");
  });
});
