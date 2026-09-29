// The latest episode of a followed show that has aired and hasn't been watched
// or put away: the title sheet keeps it in front until one of those happens.

import { isStartedShow, localIsoDate, readerDate } from "./rules";
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
