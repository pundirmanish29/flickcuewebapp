// Looked-up title details written back onto the saved title, the way the
// extension and the Android app do (SHARED.md: productionStatus and
// nextEpisode/lastEpisode are replaced on each lookup), plus two quiet
// background lookups: one keeps started shows' schedules current for the
// Queue page's Watching row, the other refreshes any title whose TMDB details
// are due again under TMDB's six-month limit (lib/metaRefresh.ts).

import { useEffect } from "react";
import { enrich } from "./editor";
import { freshFields, metaIsStale, staleTitles } from "./metaRefresh";
import { showsToRefresh } from "./rules";
import { commit, getState, type SyncStatus } from "./store";
import { fetchDetails, type TitleDetails } from "./tmdb";
import type { EpisodeAir, Movie } from "./types";

const air = (episode: TitleDetails["nextEpisode"]): EpisodeAir | undefined =>
  episode ? { season: episode.season, episode: episode.episode, airDate: episode.date, ...(episode.name ? { name: episode.name } : {}) } : undefined;

export function writeBack(movie: Movie, details: TitleDetails) {
  const library = getState().library;
  const isTv = movie.tmdbType === "tv";
  // Due a refresh: TMDB's current details replace the stored ones. Otherwise only gaps are filled,
  // so opening a title never wins a sync conflict it shouldn't.
  const next = enrich(library, movie.id, metaIsStale(movie) ? {
    ...freshFields(movie, details),
    lastEpisode: isTv ? air(details.lastEpisode) : undefined
  } : {
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

// Once this tab has synced with Drive: a refresh written before that could
// stamp a stale copy newer than an edit another device already made.
const openedAt = Date.now();
const refreshed = new Set<string>();
// Up to this many a visit, a few at a time, so a long list catches up over a few visits without a burst.
const META_PER_VISIT = 24;
let metaStarted = 0;

/** Refreshes saved titles whose TMDB details are due again, after this tab's first sync. */
export function useMetaRefresh(movies: Movie[], region: string, sync: { connected: boolean; lastSyncAt: number; status: SyncStatus; held?: number }) {
  const synced = sync.connected && sync.lastSyncAt >= openedAt && sync.status === "idle" && !sync.held;
  useEffect(() => {
    if (!synced || metaStarted >= META_PER_VISIT) return;
    const due = staleTitles(movies).filter((movie) => !refreshed.has(movie.id)).slice(0, META_PER_VISIT - metaStarted);
    if (!due.length) return;
    due.forEach((movie) => refreshed.add(movie.id));
    metaStarted += due.length;
    const queue = [...due];
    const worker = async () => {
      while (queue.length) {
        const movie = queue.shift()!;
        try {
          const details = await fetchDetails(movie, region);
          const current = getState().library.movies.find((item) => item.id === movie.id);
          if (current && metaIsStale(current)) writeBack(current, details);
        } catch {
          // Left for the next visit: a failed lookup changes nothing.
        }
      }
    };
    void Promise.all(Array.from({ length: AT_ONCE }, worker));
  }, [movies, region, synced]);
}
