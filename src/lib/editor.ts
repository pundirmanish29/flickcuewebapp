// Every change to the library, with the extension's rules: each edit stamps
// `updatedAt` (sync decides by it) and each removal leaves a tombstone, or the
// next merge would bring the title back from another device. Mirrors the
// Android app's LibraryEditor. Edits copy the title and change only the
// fields they own, so fields this app doesn't know survive the round trip.

import { hasActiveReminder, isUnreleased, nextReminder, normalizeTitle, releaseDayReminder } from "./rules";
import type { Candidate, LibraryDocument, Movie } from "./types";

export type EditResult =
  | { ok: true; document: LibraryDocument; movie: Movie }
  | { ok: false; reason: string };

function edit(document: LibraryDocument, id: string, now: number, change: (movie: Movie) => string | null): EditResult {
  const index = document.movies.findIndex((movie) => movie.id === id);
  if (index < 0) return { ok: false, reason: "Title was removed." };
  const movie: Movie = structuredClone(document.movies[index]);
  const refused = change(movie);
  if (refused) return { ok: false, reason: refused };
  movie.updatedAt = now;
  const movies = [...document.movies];
  movies[index] = movie;
  return { ok: true, document: { ...document, movies }, movie };
}

/** A title that isn't out yet can't be watched. */
export function setWatched(document: LibraryDocument, id: string, watched: boolean, now = Date.now()): EditResult {
  return edit(document, id, now, (movie) => {
    if (watched && isUnreleased(movie, now)) return "Not released yet.";
    movie.watched = watched;
    movie.personal = { ...(movie.personal ?? {}), status: watched ? "finished" : "queued" };
    if (watched) movie.watchedAt = now;
    else delete movie.watchedAt;
    return null;
  });
}

/** An exact moment the person chose. It has to be in the future. */
export function setReminder(document: LibraryDocument, id: string, at: number, now = Date.now()): EditResult {
  if (at <= now) return { ok: false, reason: "Pick a time in the future." };
  return edit(document, id, now, (movie) => {
    movie.remindAt = at;
    return null;
  });
}

export function clearReminder(document: LibraryDocument, id: string, now = Date.now()): EditResult {
  return edit(document, id, now, (movie) => {
    if (movie.remindAt == null) return "No reminder to clear.";
    movie.remindAt = null;
    return null;
  });
}

/** Release day for an unreleased title, tomorrow evening otherwise. */
export function snooze(document: LibraryDocument, id: string, now = Date.now()): EditResult {
  return edit(document, id, now, (movie) => {
    movie.remindAt = nextReminder(movie, now);
    return null;
  });
}

/** Keeping an eye on an upcoming title also sets a release-day reminder, unless one is already set. */
export function setInterested(document: LibraryDocument, id: string, interested: boolean, now = Date.now()): EditResult {
  return edit(document, id, now, (movie) => {
    if (Boolean(movie.personal?.interested) === interested) return "Unchanged.";
    const personal = { ...(movie.personal ?? {}) };
    if (interested) personal.interested = true;
    else delete personal.interested;
    movie.personal = personal;
    if (interested && !hasActiveReminder(movie, now)) {
      const releaseDay = releaseDayReminder(movie.releaseDate, now);
      if (releaseDay) movie.remindAt = releaseDay;
    }
    return null;
  });
}

export function setNote(document: LibraryDocument, id: string, note: string, now = Date.now()): EditResult {
  return edit(document, id, now, (movie) => {
    const trimmed = note.slice(0, 2000);
    if ((movie.personal?.note ?? "") === trimmed) return "Unchanged.";
    movie.personal = { ...(movie.personal ?? {}), note: trimmed };
    return null;
  });
}

/** Ticks one episode on or off ("season:episode", as the extension stores it). */
export function toggleEpisode(document: LibraryDocument, id: string, season: number, episode: number, now = Date.now()): EditResult {
  return edit(document, id, now, (movie) => {
    const key = `${season}:${episode}`;
    const episodes = new Set(movie.personal?.episodes ?? []);
    if (episodes.has(key)) episodes.delete(key);
    else episodes.add(key);
    movie.personal = { ...(movie.personal ?? {}), episodes: [...episodes] };
    return null;
  });
}

/** Marks a whole season seen, or clears it when it already is. */
export function toggleSeason(document: LibraryDocument, id: string, season: number, total: number, now = Date.now()): EditResult {
  return edit(document, id, now, (movie) => {
    const episodes = new Set(movie.personal?.episodes ?? []);
    const keys = Array.from({ length: Math.min(total, 1000) }, (_, index) => `${season}:${index + 1}`);
    const complete = keys.every((key) => episodes.has(key));
    for (const key of keys) {
      if (complete) episodes.delete(key);
      else episodes.add(key);
    }
    movie.personal = { ...(movie.personal ?? {}), episodes: [...episodes] };
    return null;
  });
}

export function remove(document: LibraryDocument, id: string, now = Date.now()): EditResult {
  const movie = document.movies.find((item) => item.id === id);
  if (!movie) return { ok: false, reason: "Title already removed." };
  return {
    ok: true,
    document: {
      movies: document.movies.filter((item) => item.id !== id),
      deleted: [...document.deleted.filter((entry) => entry.id !== id), { id, deletedAt: now }]
    },
    movie
  };
}

/** Undo for a removal: puts the title back, stamped newer than its tombstone. */
export function restore(document: LibraryDocument, backup: Movie, now = Date.now()): EditResult {
  if (!backup?.id || !backup.title) return { ok: false, reason: "Nothing to restore." };
  if (document.movies.some((movie) => movie.id === backup.id)) {
    return { ok: false, reason: "Title has changed since this action; undo skipped." };
  }
  const movie = { ...structuredClone(backup), updatedAt: now };
  return { ok: true, document: { ...document, movies: [movie, ...document.movies] }, movie };
}

/** Clears every watched title, with a tombstone each. */
export function clearWatched(document: LibraryDocument, now = Date.now()): { document: LibraryDocument; removed: Movie[] } {
  const removed = document.movies.filter((movie) => movie.watched);
  if (!removed.length) return { document, removed };
  const ids = new Set(removed.map((movie) => movie.id));
  return {
    document: {
      movies: document.movies.filter((movie) => !ids.has(movie.id)),
      deleted: [...document.deleted.filter((entry) => !ids.has(entry.id)), ...[...ids].map((id) => ({ id, deletedAt: now }))]
    },
    removed
  };
}

/** Same TMDB identity, or the same title with no conflicting year or type. */
export function findExisting(document: LibraryDocument, candidate: Pick<Candidate, "title" | "year" | "mediaType" | "tmdbId" | "tmdbType">): Movie | undefined {
  const wanted = normalizeTitle(candidate.title);
  return document.movies.find((saved) => {
    if (saved.tmdbId && candidate.tmdbId) {
      return String(saved.tmdbId) === candidate.tmdbId && (saved.tmdbType || "") === candidate.tmdbType;
    }
    return normalizeTitle(saved.title) === wanted
      && (!saved.year || !candidate.year || saved.year === candidate.year)
      && (!saved.mediaType || !candidate.mediaType || saved.mediaType === candidate.mediaType);
  });
}

/** background.js addMovieFromPage, for a TMDB result. A duplicate returns the existing title. */
export function addFromCandidate(document: LibraryDocument, candidate: Candidate, remindAt: number | null = null, now = Date.now()): EditResult {
  const existing = findExisting(document, candidate);
  if (existing) return { ok: false, reason: `"${existing.title}" is already in your list.` };

  const movie: Movie = {
    id: crypto.randomUUID(),
    title: candidate.title,
    remindAt,
    watched: false,
    createdAt: now,
    updatedAt: now,
    sourceUrl: ""
  };
  if (candidate.poster) movie.poster = candidate.poster;
  if (candidate.backdrop) movie.backdrop = candidate.backdrop;
  if (candidate.year) movie.year = candidate.year;
  if (candidate.mediaType) movie.mediaType = candidate.mediaType;
  if (isUnreleased(candidate, now)) movie.upcoming = true;
  if (candidate.releaseDate) movie.releaseDate = candidate.releaseDate;
  if (candidate.tmdbId) movie.tmdbId = candidate.tmdbId;
  if (candidate.tmdbType) movie.tmdbType = candidate.tmdbType;
  if (candidate.rating) movie.rating = candidate.rating;
  if (candidate.overview) movie.tagline = candidate.overview.slice(0, 200);

  return { ok: true, document: { ...document, movies: [movie, ...document.movies] }, movie };
}

/** A title typed in by hand, with no library match. */
export function addManual(document: LibraryDocument, title: string, year: string, mediaType: string, remindAt: number | null, now = Date.now()): EditResult {
  const clean = title.trim().slice(0, 200);
  if (!clean) return { ok: false, reason: "Type a title first." };
  const cleanYear = /^\d{4}$/.test(year.trim()) ? year.trim() : "";
  const fullTitle = cleanYear ? `${clean} (${cleanYear})` : clean;
  const existing = findExisting(document, { title: fullTitle, year: cleanYear, mediaType, tmdbId: "", tmdbType: "movie" });
  if (existing) return { ok: false, reason: `"${existing.title}" is already in your list.` };
  const movie: Movie = {
    id: crypto.randomUUID(),
    title: fullTitle,
    remindAt,
    watched: false,
    createdAt: now,
    updatedAt: now,
    sourceUrl: "",
    mediaType
  };
  if (cleanYear) movie.year = cleanYear;
  return { ok: true, document: { ...document, movies: [movie, ...document.movies] }, movie };
}

/**
 * Details fetched on demand are written back onto the saved title (same field
 * names as the extension). Nothing is written, and `updatedAt` isn't bumped,
 * when nothing changed, so opening a title never wins a sync conflict it
 * shouldn't.
 */
export function enrich(document: LibraryDocument, id: string, fields: Partial<Movie>, now = Date.now()): LibraryDocument | null {
  const index = document.movies.findIndex((movie) => movie.id === id);
  if (index < 0) return null;
  const movie: Movie = structuredClone(document.movies[index]);
  let changed = false;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    if (JSON.stringify(movie[key]) === JSON.stringify(value)) continue;
    movie[key] = value;
    changed = true;
  }
  if (!changed) return null;
  movie.updatedAt = now;
  const movies = [...document.movies];
  movies[index] = movie;
  return { ...document, movies };
}
