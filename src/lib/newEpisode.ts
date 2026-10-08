// The latest episode of a followed show that has aired and hasn't been watched
// or put away: the title sheet keeps it in front until one of those happens.

import { getShowSchedule, isStartedShow, localIsoDate, readerDate, seasonStarts } from "./rules";
import type { Movie } from "./types";

export interface AiredEpisode {
  season: number;
  episode: number;
  name: string;
  date: string;
}

const DISMISSED_KEY = "flickcue.dismissedEpisodes";

/** Keeps only the last 300, so the list can't grow without end. */
const KEEP = 300;

export const episodeKey = (movieId: string, season: number, episode: number) => `${movieId}:${season}:${episode}`;

export function readDismissed(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function dismissEpisode(key: string): string[] {
  const next = [...readDismissed().filter((item) => item !== key), key].slice(-KEEP);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Without storage it comes back next visit, which is the safe way round.
  }
  return next;
}

/**
 * The show's latest aired episode, when the reader follows the show and hasn't
 * ticked it off or put it away. Air dates are read on the reader's calendar.
 */
export function newEpisodeFor(
  movie: Movie,
  last: AiredEpisode | null | undefined,
  dismissed: readonly string[],
  now = Date.now()
): AiredEpisode | null {
  if (!last || !isStartedShow(movie)) return null;
  if (readerDate(last.date) > localIsoDate(now)) return null;
  if (movie.personal?.episodes?.includes(`${last.season}:${last.episode}`)) return null;
  if (dismissed.includes(episodeKey(movie.id, last.season, last.episode))) return null;
  return last;
}

export interface UpNext extends AiredEpisode {
  /**
   * "next": the one after the furthest watched, aired, while catching up;
   * "new": the latest aired episode; "upcoming": caught up, so the next one
   * to air, which can't be ticked off yet.
   */
  state: "next" | "new" | "upcoming";
}

const order = (season: number, episode: number) => season * 1_000_000 + episode;

/** The furthest episode the reader has ticked off ("6:2" → season 6, episode 2), specials aside. */
function furthestWatched(movie: Movie): { season: number; episode: number } | null {
  let best: { season: number; episode: number } | null = null;
  for (const key of movie.personal?.episodes ?? []) {
    const [season, episode] = key.split(":").map(Number);
    if (!(season > 0 && episode > 0)) continue;
    if (!best || order(season, episode) > order(best.season, best.episode)) best = { season, episode };
  }
  return best;
}

/**
 * The episode a followed show's reader should see next, in order of use: the
 * one after the furthest they've watched when it has aired (catching up), else
 * the latest aired one (as newEpisodeFor), else, once they're caught up, the
 * next one to air. Null when the show isn't being followed or nothing is known.
 */
export function upNextEpisode(
  movie: Movie,
  last: AiredEpisode | null | undefined,
  next: AiredEpisode | null | undefined,
  dismissed: readonly string[],
  now = Date.now()
): UpNext | null {
  if (!isStartedShow(movie)) return null;
  const today = localIsoDate(now);
  const seen = new Set(movie.personal?.episodes ?? []);
  const unwatched = (air: { season: number; episode: number }) => !seen.has(`${air.season}:${air.episode}`);
  const lastAired = last && readerDate(last.date) <= today ? last : null;

  // Catching up: the episode after the furthest watched, if it has aired and hasn't been put away.
  const furthest = furthestWatched(movie);
  if (furthest && lastAired) {
    // Where the furthest watched season ends, and the next begins (One Piece numbers through the run).
    const starts = seasonStarts(movie);
    const size = movie.seasons?.find((season) => season.number === furthest.season)?.episodes;
    const end = size !== undefined ? (starts.get(furthest.season) ?? 1) + Number(size) - 1
      : lastAired.season === furthest.season ? lastAired.episode : 0;
    const throughout = (starts.get(furthest.season) ?? 1) > 1;
    const after = furthest.episode < end
      ? { season: furthest.season, episode: furthest.episode + 1 }
      : movie.seasons?.some((season) => season.number === furthest.season + 1) || lastAired.season > furthest.season
        ? { season: furthest.season + 1, episode: starts.get(furthest.season + 1) ?? (throughout ? end + 1 : 1) }
        : null;
    const isLast = after && after.season === lastAired.season && after.episode === lastAired.episode;
    if (after && !isLast && order(after.season, after.episode) < order(lastAired.season, lastAired.episode)
      && unwatched(after) && !dismissed.includes(episodeKey(movie.id, after.season, after.episode))) {
      return { ...after, name: "", date: "", state: "next" };
    }
  }

  const fresh = newEpisodeFor(movie, last, dismissed, now);
  if (fresh) return { ...fresh, state: "new" };

  // Caught up: the next one to air (TMDB's "last" can still be tomorrow on the reader's calendar).
  const coming = [last, next].find((air) => air && readerDate(air.date) > today && unwatched(air));
  return coming ? { ...coming, state: "upcoming" } : null;
}

export interface TonightEntry {
  movie: Movie;
  season: number;
  episode: number;
  /** "today": airs today; "out": it has aired today and isn't ticked off. */
  state: "today" | "out";
}

/**
 * Episodes of followed shows airing today on the reader's calendar, and ones
 * that came out today and haven't been watched or put away, alphabetically.
 */
export function airingToday(movies: readonly Movie[], dismissed: readonly string[], now = Date.now()): TonightEntry[] {
  const today = localIsoDate(now);
  const entries: TonightEntry[] = [];
  for (const movie of movies) {
    if (!isStartedShow(movie)) continue;
    const schedule = getShowSchedule(movie);
    const seen = new Set(movie.personal?.episodes ?? []);
    const candidates: [{ date: string; season: number; episode: number } | null | undefined, "today" | "out"][] = [[schedule?.next, "today"], [schedule?.last, "out"]];
    for (const [air, state] of candidates) {
      if (!air || air.date !== today) continue;
      if (seen.has(`${air.season}:${air.episode}`) || dismissed.includes(episodeKey(movie.id, air.season, air.episode))) continue;
      entries.push({ movie, season: air.season, episode: air.episode, state });
      break;
    }
  }
  return entries.sort((a, b) => a.movie.title.localeCompare(b.movie.title));
}
