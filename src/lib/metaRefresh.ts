// TMDB's terms let an app hold its data for six months at most (§1.C), so a
// saved title's details are fetched again before then: any title whose
// metaFetchedAt is missing or older than 150 days, the extension's own limit
// (shared.js, META_MAX_AGE). A refresh overwrites what TMDB supplied rather
// than only filling gaps, keeps what the reader chose (a locked poster, the
// sharp backdrop), and stamps metaFetchedAt so the other clients see it's fresh.

import { safeTmdbId } from "./safe";
import type { TitleDetails } from "./tmdb";
import type { Movie } from "./types";

const DAY = 24 * 60 * 60 * 1000;
export const META_MAX_AGE = 150 * DAY;

/** A saved title holding TMDB data that is due to be fetched again. */
export function metaIsStale(movie: Movie, now = Date.now()): boolean {
  if (!safeTmdbId(movie.tmdbId)) return false;
  return now - (Number(movie.metaFetchedAt) || 0) > META_MAX_AGE;
}

/** The titles due a refresh, the longest unrefreshed first, those still to watch before watched ones. */
export function staleTitles(movies: readonly Movie[], now = Date.now()): Movie[] {
  return movies
    .filter((movie) => metaIsStale(movie, now))
    .sort((a, b) => Number(Boolean(a.watched)) - Number(Boolean(b.watched)) || (Number(a.metaFetchedAt) || 0) - (Number(b.metaFetchedAt) || 0));
}

/** The image's own path ("/abc.jpg"), so the same poster at another size doesn't count as a change. */
const imagePath = (url: string | undefined) => String(url ?? "").split("/").pop() ?? "";

/**
 * What a refresh writes: TMDB's current details over the stored ones, and the stamp.
 * Empty values are left out (enrich skips them), so a field TMDB no longer has stays as it was.
 */
export function freshFields(movie: Movie, details: TitleDetails, now = Date.now()): Partial<Movie> {
  const fields: Partial<Movie> = {
    tagline: details.overview ? details.overview.slice(0, 200) : undefined,
    rating: details.rating || undefined,
    runtimeMinutes: details.runtimeMinutes || undefined,
    genres: details.genres.length ? details.genres : undefined,
    genre: details.genres[0],
    imdbId: details.imdbId || undefined,
    productionStatus: details.status || undefined,
    seasons: details.seasons.length ? details.seasons : undefined,
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(details.releaseDate) ? details.releaseDate : undefined,
    // The sharp backdrop chosen for this title is kept; one is only added where there's none.
    backdrop: movie.backdrop ? undefined : details.backdrop || undefined,
    metaFetchedAt: now
  };
  if (!movie.posterLocked && details.poster && imagePath(details.poster) !== imagePath(movie.poster)) fields.poster = details.poster;
  return fields;
}
