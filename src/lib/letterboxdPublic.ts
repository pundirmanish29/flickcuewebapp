import { addFromCandidate, findExisting } from "./editor";
import { PROXY_BASE_URL } from "./config";
import { fetchCandidate, searchTitles } from "./tmdb";
import { normalizeTitle } from "./rules";
import type { Candidate, LibraryDocument, Movie } from "./types";

function letterboxdData(movie: Movie): Partial<PublicEntry> {
  return movie.letterboxd && typeof movie.letterboxd === "object" ? movie.letterboxd as Partial<PublicEntry> : {};
}

export interface PublicEntry {
  slug: string; title: string; year: string; tmdbId?: string; tmdbType?: "movie" | "tv";
  watched?: boolean; watchedDate?: string; rating?: number; liked?: boolean; review?: string; inWatchlist?: boolean;
}
export interface PublicProfile {
  username: string; displayName?: string; avatarUrl?: string; entries: PublicEntry[];
  recentAvailable: boolean; recentCount: number; watchlistAvailable: boolean; watchlistComplete: boolean; watchlistCount: number;
  warnings: string[]; fetchedAt: number;
}
export interface PublicImportRecord {
  syncedAt: number; added: number; updated: number; skipped: number; warnings: string[];
  // Remember removals and manual unwatching across repeat imports on this device.
  imported: Record<string, string>;
}
export type ResolvedEntry = { entry: PublicEntry; candidate: Candidate | null };

export async function fetchPublicProfile(username: string): Promise<PublicProfile> {
  if (!/^[a-z0-9_]{1,30}$/.test(username)) throw new Error("Enter a valid Letterboxd username.");
  const base = import.meta.env.DEV ? "" : PROXY_BASE_URL;
  const response = await fetch(`${base}/letterboxd-public/${username}`, { signal: AbortSignal.timeout(150_000), credentials: "omit" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Couldn't read this public profile. Try again later.");
  if (body.username !== username || !Array.isArray(body.entries) || body.entries.length > 600 || !Array.isArray(body.warnings)) throw new Error("The public profile response wasn't recognised.");
  return body;
}

/** Exact feed identity first; ambiguous watchlist search results are skipped. */
export async function resolvePublicEntry(entry: PublicEntry): Promise<Candidate | null> {
  if (entry.tmdbId && entry.tmdbType) return fetchCandidate(entry.tmdbType, entry.tmdbId);
  const results = await searchTitles(entry.year ? `${entry.title} (${entry.year})` : entry.title);
  const matches = results.titles.filter(title => normalizeTitle(title.title) === normalizeTitle(entry.title)
    && (!entry.year || title.year === entry.year) && title.tmdbType === "movie");
  return matches.length === 1 ? matches[0] : null;
}

/** Additive import: absence in a limited public source never deletes old data. */
export function mergePublicEntries(library: LibraryDocument, resolved: ResolvedEntry[], previous: PublicImportRecord | null, now = Date.now()) {
  let document = library;
  const imported = { ...previous?.imported };
  const deleted = new Set(library.deleted.map(item => item.id));
  let added = 0; let updated = 0; let skipped = 0;
  for (const { entry, candidate } of resolved) {
    const remembered = imported[entry.slug];
    if (remembered && (deleted.has(remembered) || !document.movies.some(movie => movie.id === remembered))) { skipped++; continue; }
    const slugMatch = document.movies.find(movie => letterboxdData(movie)?.slug === entry.slug);
    let match = slugMatch || document.movies.find(movie => entry.tmdbId && String(movie.tmdbId) === entry.tmdbId && movie.tmdbType === entry.tmdbType)
      || (candidate ? findExisting(document, candidate) : undefined);
    let isNew = false;
    if (!match) {
      if (!candidate) { skipped++; continue; }
      // Stable imported ids also let another web device respect Drive tombstones.
      const id = `letterboxd:tmdb:${candidate.tmdbType}:${candidate.tmdbId}`;
      if (deleted.has(id)) { skipped++; continue; }
      const result = addFromCandidate(document, candidate, null, now);
      if (!result.ok) { skipped++; continue; }
      match = { ...result.movie, id, origin: "letterboxd", sourceUrl: `https://letterboxd.com/film/${entry.slug}/` };
      document = { ...document, movies: [match, ...document.movies] };
      isNew = true; added++;
    }
    imported[entry.slug] = match.id;
    const oldData = letterboxdData(match) || {};
    const data = { ...oldData, slug: entry.slug };
    for (const key of ["rating", "liked", "review", "inWatchlist", "watched", "watchedDate"] as const) {
      if (entry[key] !== undefined && entry[key] !== "") Object.assign(data, { [key]: entry[key] });
    }
    const next = { ...match, letterboxd: data };
    // An earlier imported watch followed by a manual unwatch remains unwatched.
    if (entry.watched && !match.watched && !oldData.watched) {
      next.watched = true;
      next.personal = { ...match.personal, status: "finished" };
      const date = Date.parse(`${entry.watchedDate || ""}T12:00:00Z`);
      next.watchedAt = Number.isFinite(date) ? date : now;
      next.upcoming = false;
    }
    if (JSON.stringify(next) !== JSON.stringify(match)) {
      next.updatedAt = now;
      document = { ...document, movies: document.movies.map(movie => movie.id === match!.id ? next : movie) };
      if (!isNew) updated++;
    }
  }
  const record: PublicImportRecord = { syncedAt: now, added, updated, skipped, imported, warnings: [] };
  return { document, record };
}
