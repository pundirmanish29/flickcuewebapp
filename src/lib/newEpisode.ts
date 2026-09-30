// The latest episode of a followed show that has aired and hasn't been watched
// or put away: the title sheet keeps it in front until one of those happens.

import { getShowSchedule, isStartedShow, localIsoDate, readerDate } from "./rules";
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
