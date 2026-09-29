// Looked-up title details written back onto the saved title, the way the
// extension and the Android app do (SHARED.md: productionStatus and
// nextEpisode/lastEpisode are replaced on each lookup), plus a quiet
// background lookup that keeps started shows' schedules current for the
// Queue page's Watching row.

import { useEffect } from "react";
import { enrich } from "./editor";
import { showsToRefresh } from "./rules";
import { commit, getState } from "./store";
import { fetchDetails, type TitleDetails } from "./tmdb";
import type { EpisodeAir, Movie } from "./types";

const air = (episode: TitleDetails["nextEpisode"]): EpisodeAir | undefined =>
  episode ? { season: episode.season, episode: episode.episode, airDate: episode.date, ...(episode.name ? { name: episode.name } : {}) } : undefined;

export function writeBack(movie: Movie, details: TitleDetails) {
  const library = getState().library;
  const isTv = movie.tmdbType === "tv";
  const next = enrich(library, movie.id, {
    runtimeMinutes: details.runtimeMinutes || undefined,
    genres: details.genres.length ? details.genres : undefined,
    genre: details.genres[0],
    imdbId: details.imdbId,
    productionStatus: details.status,
    tagline: movie.tagline ? undefined : details.overview.slice(0, 200),
    backdrop: movie.backdrop ? undefined : details.backdrop,
    poster: movie.poster ? undefined : details.poster,
    rating: movie.rating ? undefined : details.rating,
    seasons: details.seasons.length ? details.seasons : undefined,
    lastEpisode: isTv ? air(details.lastEpisode) : undefined
  });
  // enrich() skips empty values, so a show with no next episode any more is cleared here.
  let document = next ?? library;
  if (isTv) {
    const index = document.movies.findIndex((item) => item.id === movie.id);
    const current = document.movies[index];
    const wanted = air(details.nextEpisode);
    if (current && JSON.stringify(current.nextEpisode ?? null) !== JSON.stringify(wanted ?? null)) {
      const updated: Movie = { ...current, updatedAt: Date.now() };
      if (wanted) updated.nextEpisode = wanted;
      else delete updated.nextEpisode;
      const movies = [...document.movies];
      movies[index] = updated;
      document = { ...document, movies };
    }
  }
  if (document !== library) commit(document);
}

// Per visit: each show is looked up at most once, a batch at a time.
const checked = new Set<string>();
const BATCH = 16;
const AT_ONCE = 3;

/** Looks up started shows whose schedule is unknown or stale, a few at a time. */
export function useShowScheduleRefresh(movies: Movie[], region: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const due = showsToRefresh(movies).filter((movie) => !checked.has(movie.id)).slice(0, BATCH);
    if (!due.length) return;
    due.forEach((movie) => checked.add(movie.id));
    // The batch runs to the end on its own: each result written back changes
    // the list and re-runs this effect, which mustn't cancel the rest.
    const queue = [...due];
    const worker = async () => {
      while (queue.length) {
        const movie = queue.shift()!;
        try {
          const details = await fetchDetails(movie, region);
          const current = getState().library.movies.find((item) => item.id === movie.id);
          if (current) writeBack(current, details);
        } catch {
          // Left as checked: a failed lookup waits for the next visit rather than retrying at once.
        }
      }
    };
    void Promise.all(Array.from({ length: AT_ONCE }, worker));
    // Movies change as results are written back; the checked set keeps it to one pass.
  }, [movies, region, enabled]);
}
