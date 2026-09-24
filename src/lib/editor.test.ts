import { describe, expect, it } from "vitest";
import * as editor from "./editor";
import { mergeWatchlists } from "./merge";
import { sortMovies, tonightReminder, weekendReminder } from "./rules";
import type { Candidate, LibraryDocument } from "./types";

const NOW = new Date(2026, 8, 24, 15, 0).getTime();

const doc = (): LibraryDocument => ({
  movies: [
    { id: "a", title: "Arrival (2016)", year: "2016", createdAt: NOW - 5000, updatedAt: NOW - 5000, custom: { keep: true } },
    { id: "b", title: "The Odyssey (2026)", releaseDate: "2026-12-18", createdAt: NOW - 4000, updatedAt: NOW - 4000 }
  ],
  deleted: []
});

const candidate: Candidate = {
  key: "tmdb:movie:1", title: "Heat (1995)", year: "1995", mediaType: "Movie", tmdbType: "movie", tmdbId: "949",
  releaseDate: "1995-12-15", overview: "A thief and a detective.", rating: "7.9", poster: "", backdrop: "", upcoming: false
};

describe("library editor", () => {
  it("stamps updatedAt on every edit and keeps unknown fields", () => {
    const result = editor.setWatched(doc(), "a", true, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.movie.updatedAt).toBe(NOW);
    expect(result.movie.watchedAt).toBe(NOW);
    expect(result.movie.personal?.status).toBe("finished");
    expect(result.movie.custom).toEqual({ keep: true });
  });

  it("refuses to mark an unreleased title watched", () => {
    expect(editor.setWatched(doc(), "b", true, NOW).ok).toBe(false);
  });

  it("leaves a tombstone that survives a merge with the old copy", () => {
    const original = doc();
    const removed = editor.remove(original, "a", NOW);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const merged = mergeWatchlists(removed.document, original, NOW);
    expect(merged.movies.some((movie) => movie.id === "a")).toBe(false);
  });

  it("undo restores a removed title past its own tombstone", () => {
    const removed = editor.remove(doc(), "a", NOW);
    if (!removed.ok) throw new Error();
    const restored = editor.restore(removed.document, removed.movie, NOW + 1);
    if (!restored.ok) throw new Error();
    const merged = mergeWatchlists(restored.document, removed.document, NOW + 2);
    expect(merged.movies.some((movie) => movie.id === "a")).toBe(true);
  });

  it("adds a search result once, with the extension's fields", () => {
    const added = editor.addFromCandidate(doc(), candidate, null, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.movie).toMatchObject({ title: "Heat (1995)", tmdbId: "949", tmdbType: "movie", remindAt: null, watched: false, tagline: "A thief and a detective." });
    expect(editor.addFromCandidate(added.document, candidate, null, NOW).ok).toBe(false);
  });

  it("marking interested sets a release-day reminder", () => {
    const result = editor.setInterested(doc(), "b", true, NOW);
    if (!result.ok) throw new Error();
    expect(result.movie.personal?.interested).toBe(true);
    expect(new Date(Number(result.movie.remindAt)).getDate()).toBe(18);
  });

  it("enrich changes nothing, and stamps nothing, when nothing is new", () => {
    const first = editor.enrich(doc(), "a", { runtimeMinutes: 116 }, NOW);
    expect(first?.movies[0].runtimeMinutes).toBe(116);
    expect(editor.enrich(first!, "a", { runtimeMinutes: 116 }, NOW + 1)).toBeNull();
  });

  it("tracks episodes as season:episode", () => {
    const toggled = editor.toggleSeason(doc(), "a", 1, 3, NOW);
    if (!toggled.ok) throw new Error();
    expect(toggled.movie.personal?.episodes).toEqual(["1:1", "1:2", "1:3"]);
    const cleared = editor.toggleSeason(toggled.document, "a", 1, 3, NOW);
    if (!cleared.ok) throw new Error();
    expect(cleared.movie.personal?.episodes).toEqual([]);
  });
});

describe("rules", () => {
  it("tonight is 8 PM today, or an hour from now after that", () => {
    expect(new Date(tonightReminder(NOW)).getHours()).toBe(20);
    const late = new Date(2026, 8, 24, 21, 0).getTime();
    expect(tonightReminder(late)).toBe(late + 60 * 60 * 1000);
  });

  it("the weekend is the coming Saturday morning", () => {
    const date = new Date(weekendReminder(NOW));
    expect(date.getDay()).toBe(6);
    expect(date.getHours()).toBe(10);
  });

  it("sorts unknown runtimes last for shortest first", () => {
    const sorted = sortMovies([
      { id: "1", title: "A", runtimeMinutes: 0 },
      { id: "2", title: "B", runtimeMinutes: 90 },
      { id: "3", title: "C", runtimeMinutes: 200 }
    ], "shortest");
    expect(sorted.map((movie) => movie.id)).toEqual(["2", "3", "1"]);
  });
});
