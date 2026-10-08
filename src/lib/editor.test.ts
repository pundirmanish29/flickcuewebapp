import { describe, expect, it } from "vitest";
import * as editor from "./editor";
import { mergeWatchlists } from "./merge";
import { sortMovies, tonightReminder, weekendReminder } from "./rules";
import type { Candidate, LibraryDocument, Movie } from "./types";

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

  it("marks only the episodes that have aired when told which", () => {
    const marked = editor.toggleSeason(doc(), "a", 1, 4, NOW, [1, 2]);
    if (!marked.ok) throw new Error();
    expect(marked.movie.personal?.episodes).toEqual(["1:1", "1:2"]);
    // Clearing takes off those two and leaves an episode ticked outside them.
    const withLater = editor.toggleEpisode(marked.document, "a", 1, 4, NOW);
    if (!withLater.ok) throw new Error();
    const cleared = editor.toggleSeason(withLater.document, "a", 1, 4, NOW, [1, 2]);
    if (!cleared.ok) throw new Error();
    expect(cleared.movie.personal?.episodes).toEqual(["1:4"]);
  });

  it("marks a season numbered through the whole run (One Piece, past 1,000)", () => {
    const marked = editor.toggleSeason(doc(), "a", 23, 3, NOW, [1178, 1179, 1180]);
    if (!marked.ok) throw new Error();
    expect(marked.movie.personal?.episodes).toEqual(["23:1178", "23:1179", "23:1180"]);
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

describe("start and stop watching a show", () => {
  const doc = (movie: Partial<Movie>): LibraryDocument => ({ movies: [{ id: "s", title: "Slow Horses", mediaType: "Show", tmdbType: "tv", releaseDate: "2022-04-01", ...movie } as Movie], deleted: [] });
  it("marks a show as watching, and a watched one goes back to unwatched", () => {
    const started = editor.setWatching(doc({}), "s", true, NOW);
    expect(started.ok && started.movie.personal?.status).toBe("watching");
    const rewatch = editor.setWatching(doc({ watched: true, watchedAt: 5 }), "s", true, NOW);
    expect(rewatch.ok && [rewatch.movie.watched, rewatch.movie.watchedAt, rewatch.movie.personal?.status]).toEqual([false, undefined, "watching"]);
  });
  it("stops watching back to queued, and refuses films", () => {
    const stopped = editor.setWatching(doc({ personal: { status: "watching" } }), "s", false, NOW);
    expect(stopped.ok && stopped.movie.personal?.status).toBe("queued");
    expect(editor.setWatching(doc({ mediaType: "Movie", tmdbType: "movie" }), "s", true, NOW).ok).toBe(false);
  });
});

describe("your take", () => {
  it("sets stars in halves and a heart, and clears stars at 0", () => {
    const base: LibraryDocument = { movies: [{ id: "m", title: "Heat", personal: { note: "keep" } } as Movie], deleted: [] };
    const rated = editor.setTake(base, "m", { rating: 3.7, liked: true }, NOW);
    expect(rated.ok && rated.movie.personal).toEqual({ note: "keep", rating: 3.5, liked: true });
    const cleared = rated.ok ? editor.setTake(rated.document, "m", { rating: 0 }, NOW) : rated;
    expect(cleared.ok && cleared.movie.personal).toEqual({ note: "keep", liked: true });
  });
});

describe("tickets", () => {
  const show = NOW + 3 * 24 * 60 * 60 * 1000; // three days from now
  const HOUR = 60 * 60 * 1000;

  it("puts a ticket on a title with a reminder an hour before the show", () => {
    const result = editor.setBooking(doc(), "a", { showAt: show, cinema: " PVR: Saket ", screen: "Audi 2", seats: ["h12", "H13", "h12", " "], bookingId: "WG1", source: "bookmyshow" }, NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.movie.booking).toEqual({ showAt: show, addedAt: NOW, cinema: "PVR: Saket", screen: "Audi 2", seats: ["H12", "H13"], bookingId: "WG1", source: "bookmyshow" });
    expect(result.movie.remindAt).toBe(show - HOUR);
    expect(result.movie.updatedAt).toBe(NOW);
    expect(result.movie.custom).toEqual({ keep: true });
  });

  it("needs a showtime", () => {
    expect(editor.setBooking(doc(), "a", { showAt: NaN }, NOW)).toMatchObject({ ok: false });
  });

  it("leaves the reminder alone when the show is less than an hour away or past", () => {
    const start = { ...doc(), movies: doc().movies.map((movie) => (movie.id === "a" ? { ...movie, remindAt: NOW + 10 * HOUR } : movie)) };
    const result = editor.setBooking(start, "a", { showAt: NOW + 30 * 60 * 1000 }, NOW);
    expect(result.ok && result.movie.remindAt).toBe(NOW + 10 * HOUR);
  });

  it("keeps when it was first added, and asks 'did you watch it?' again only for a new showtime", () => {
    const first = editor.setBooking(doc(), "a", { showAt: show }, NOW);
    if (!first.ok) throw new Error();
    const asked = editor.dismissWatchedPrompt(first.document, "a", NOW + 1);
    if (!asked.ok) throw new Error();
    expect(asked.movie.booking?.watchedAsked).toBe(true);
    const same = editor.setBooking(asked.document, "a", { showAt: show, seats: ["A1"] }, NOW + 2);
    expect(same.ok && same.movie.booking).toMatchObject({ addedAt: NOW, watchedAsked: true, seats: ["A1"] });
    const moved = editor.setBooking(asked.document, "a", { showAt: show + HOUR }, NOW + 3);
    expect(moved.ok && moved.movie.booking?.watchedAsked).toBeUndefined();
  });

  it("takes a ticket off with the reminder it set, but not one changed since", () => {
    const booked = editor.setBooking(doc(), "a", { showAt: show }, NOW);
    if (!booked.ok) throw new Error();
    const cleared = editor.clearBooking(booked.document, "a", NOW + 1);
    expect(cleared.ok && cleared.movie.booking).toBeUndefined();
    expect(cleared.ok && cleared.movie.remindAt).toBeNull();

    const moved = editor.setReminder(booked.document, "a", show - 3 * HOUR, NOW + 1);
    if (!moved.ok) throw new Error();
    const kept = editor.clearBooking(moved.document, "a", NOW + 2);
    expect(kept.ok && kept.movie.remindAt).toBe(show - 3 * HOUR);
    expect(editor.clearBooking(doc(), "a", NOW)).toMatchObject({ ok: false });
  });

  it("travels through a sync merge with the rest of the title", () => {
    const booked = editor.setBooking(doc(), "a", { showAt: show, seats: ["F7"] }, NOW);
    if (!booked.ok) throw new Error();
    const merged = mergeWatchlists(doc(), booked.document);
    expect(merged.movies.find((movie) => movie.id === "a")?.booking).toMatchObject({ showAt: show, seats: ["F7"] });
  });
});

describe("finishing a show", () => {
  const ended = (episodes: string[], over: Partial<Movie> = {}): LibraryDocument => ({
    movies: [{ id: "s", title: "The Sandman", tmdbType: "tv", productionStatus: "Ended", seasons: [{ number: 1, episodes: 2 }], personal: { episodes, status: "watching" }, ...over } as Movie],
    deleted: []
  });

  it("moves an ended show to Watched when its last episode is ticked", () => {
    const ticked = editor.toggleEpisode(ended(["1:1"]), "s", 1, 2);
    expect(ticked.ok && ticked.movie.watched).toBeFalsy();
    const finished = ticked.ok ? editor.finishIfComplete(ticked.document, "s", 5000) : ticked;
    expect(finished.ok && finished.movie).toMatchObject({ watched: true, watchedAt: 5000, personal: { status: "finished" } });
  });

  it("leaves a show with an episode left, or one still running, alone", () => {
    expect(editor.finishIfComplete(ended(["1:1"]), "s")).toEqual({ ok: false, reason: "Unchanged." });
    expect(editor.finishIfComplete(ended(["1:1", "1:2"], { productionStatus: "Returning Series" }), "s")).toEqual({ ok: false, reason: "Unchanged." });
  });
});
