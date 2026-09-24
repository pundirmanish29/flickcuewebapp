import { describe, expect, it } from "vitest";
import { mergeWatchlists, TOMBSTONE_TTL } from "./merge";
import type { Movie } from "./types";

const NOW = Date.UTC(2026, 8, 24);
const movie = (fields: Partial<Movie> & { id: string; title: string }): Movie => ({ createdAt: NOW - 1000, ...fields });

describe("mergeWatchlists (drive-sync.js rules)", () => {
  it("keeps the newest edit of the same id", () => {
    const local = { movies: [movie({ id: "a", title: "Dune (2021)", watched: true, updatedAt: NOW })], deleted: [] };
    const remote = { movies: [movie({ id: "a", title: "Dune (2021)", watched: false, updatedAt: NOW - 50 })], deleted: [] };
    expect(mergeWatchlists(local, remote, NOW).movies[0].watched).toBe(true);
    expect(mergeWatchlists(remote, local, NOW).movies[0].watched).toBe(true);
  });

  it("lets a delete win only over older edits", () => {
    const remote = { movies: [movie({ id: "a", title: "Heat (1995)", updatedAt: NOW - 100 })], deleted: [] };
    const local = { movies: [], deleted: [{ id: "a", deletedAt: NOW - 10 }] };
    expect(mergeWatchlists(local, remote, NOW).movies).toHaveLength(0);

    const editedLater = { movies: [movie({ id: "a", title: "Heat (1995)", updatedAt: NOW })], deleted: [] };
    expect(mergeWatchlists(local, editedLater, NOW).movies).toHaveLength(1);
  });

  it("drops tombstones older than 90 days", () => {
    const old = { movies: [], deleted: [{ id: "x", deletedAt: NOW - TOMBSTONE_TTL - 1 }] };
    expect(mergeWatchlists(old, { movies: [], deleted: [] }, NOW).deleted).toHaveLength(0);
  });

  it("collapses the same title saved on two devices onto the older record", () => {
    const local = { movies: [movie({ id: "phone", title: "Sinners (2025)", year: "2025", createdAt: NOW - 10, updatedAt: NOW })], deleted: [] };
    const remote = { movies: [movie({ id: "browser", title: "Sinners (2025)", createdAt: NOW - 500, updatedAt: NOW - 400, mediaType: "Movie" })], deleted: [] };
    const merged = mergeWatchlists(local, remote, NOW).movies;
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("browser");
    expect(merged[0].createdAt).toBe(NOW - 500);
    expect(merged[0].mediaType).toBe("Movie");
  });

  it("keeps remakes apart", () => {
    const merged = mergeWatchlists(
      { movies: [movie({ id: "1", title: "Dune (1984)", year: "1984" })], deleted: [] },
      { movies: [movie({ id: "2", title: "Dune (2021)", year: "2021" })], deleted: [] },
      NOW
    ).movies;
    expect(merged).toHaveLength(2);
  });

  it("keeps fields it doesn't know about", () => {
    const remote = { movies: [movie({ id: "a", title: "Arrival (2016)", letterboxd: { slug: "arrival-2016" }, metaVersion: 5 })], deleted: [] };
    const merged = mergeWatchlists({ movies: [], deleted: [] }, remote, NOW).movies[0];
    expect(merged.letterboxd).toEqual({ slug: "arrival-2016" });
    expect(merged.metaVersion).toBe(5);
  });

  it("orders newest-added first", () => {
    const merged = mergeWatchlists(
      { movies: [movie({ id: "1", title: "Old", createdAt: 1 }), movie({ id: "2", title: "New", createdAt: 2 })], deleted: [] },
      { movies: [], deleted: [] },
      NOW
    ).movies;
    expect(merged.map((item) => item.title)).toEqual(["New", "Old"]);
  });
});
